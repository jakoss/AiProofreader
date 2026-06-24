import { promptTemplates, type ProofreadMode } from './modes'

const DEFAULT_MODEL_PROVIDER_BASE_URL = 'http://localhost:8080/v1'

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
    text?: string
  }>
  error?: {
    message?: string
  }
}

type ChatCompletionStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string
    }
    message?: {
      content?: string
    }
    text?: string
  }>
  error?: {
    message?: string
  }
}

type OpenAiStreamEvent =
  | { type: 'chunk'; payload: ChatCompletionStreamChunk }
  | { type: 'done' }

export async function proofreadWithModelProvider(input: {
  text: string
  mode: ProofreadMode
}) {
  const prompt = promptTemplates[input.mode].replace('{{text}}', input.text)

  const response = await fetchFromModelProvider('/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getModelProviderModel(),
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0,
    }),
  })

  const payload = (await response.json().catch(() => null)) as ChatCompletionResponse | null

  if (!response.ok) {
    const message = payload?.error?.message ?? mapGatewayError(response.status)
    throw new Error(message)
  }

  const correctedText =
    payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text ?? ''

  if (!correctedText || typeof correctedText !== 'string') {
    throw new Error('Model provider returned an invalid proofreading response.')
  }

  return correctedText.trim()
}

export async function* streamProofreadWithModelProvider(input: {
  text: string
  mode: ProofreadMode
  signal?: AbortSignal
}) {
  const prompt = promptTemplates[input.mode].replace('{{text}}', input.text)

  const response = await fetchFromModelProvider('/chat/completions', {
    method: 'POST',
    signal: input.signal,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getModelProviderModel(),
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0,
      stream: true,
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ChatCompletionResponse | null
    const message = payload?.error?.message ?? mapGatewayError(response.status)
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('Model provider did not return a streaming response.')
  }

  let receivedText = false

  for await (const event of readOpenAiStreamEvents(response.body)) {
    if (event.type === 'done') {
      break
    }

    const delta = extractStreamDelta(event.payload)
    if (delta) {
      receivedText = true
      yield delta
    }
  }

  if (!receivedText) {
    throw new Error('Model provider returned an invalid proofreading response.')
  }
}

function getModelProviderBaseUrl() {
  return (
    process.env.MODEL_PROVIDER_BASE_URL ??
    DEFAULT_MODEL_PROVIDER_BASE_URL
  ).replace(/\/$/, '')
}

function getModelProviderModel() {
  const model = process.env.MODEL_PROVIDER_MODEL?.trim()

  if (!model) {
    throw new Error('MODEL_PROVIDER_MODEL is not configured.')
  }

  return model
}

async function fetchFromModelProvider(path: string, init?: RequestInit) {
  try {
    return await fetch(`${getModelProviderBaseUrl()}${path}`, {
      ...init,
      headers: getModelProviderHeaders(init?.headers),
    })
  } catch {
    throw new Error('Model provider is unavailable or did not respond.')
  }
}

function mapGatewayError(status: number) {
  if (status === 413 || status === 422) {
    return 'The text may be too large for the selected model context window.'
  }

  if (status === 502 || status === 503 || status === 504) {
    return 'Model provider is unavailable or did not respond.'
  }

  return `Model provider request failed with status ${status}.`
}

function getModelProviderHeaders(headers?: HeadersInit) {
  const requestHeaders = new Headers(headers)
  const authorizationHeader = process.env.MODEL_PROVIDER_AUTHORIZATION_HEADER

  if (authorizationHeader) {
    requestHeaders.set('Authorization', authorizationHeader)
  }

  return requestHeaders
}

async function* readOpenAiStreamEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<OpenAiStreamEvent> {
  const dataLines: string[] = []

  for await (const rawLine of readTextLines(stream)) {
    const line = rawLine.replace(/\r$/, '')

    if (line === '') {
      const event = parseOpenAiStreamEvent(dataLines)
      dataLines.length = 0

      if (event) {
        yield event
      }

      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  const event = parseOpenAiStreamEvent(dataLines)
  if (event) {
    yield event
  }
}

async function* readTextLines(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      let lineEnd = buffer.indexOf('\n')

      while (lineEnd !== -1) {
        yield buffer.slice(0, lineEnd)
        buffer = buffer.slice(lineEnd + 1)
        lineEnd = buffer.indexOf('\n')
      }
    }

    buffer += decoder.decode()

    if (buffer) {
      yield buffer
    }
  } finally {
    reader.releaseLock()
  }
}

function parseOpenAiStreamEvent(lines: string[]): OpenAiStreamEvent | null {
  if (lines.length === 0) {
    return null
  }

  const data = lines.join('\n').trim()
  if (!data) {
    return null
  }

  if (data === '[DONE]') {
    return { type: 'done' }
  }

  try {
    return {
      type: 'chunk',
      payload: JSON.parse(data) as ChatCompletionStreamChunk,
    }
  } catch {
    throw new Error('Model provider returned an invalid streaming response.')
  }
}

function extractStreamDelta(payload: ChatCompletionStreamChunk) {
  if (payload.error?.message) {
    throw new Error(payload.error.message)
  }

  return (payload.choices ?? [])
    .map((choice) => choice.delta?.content ?? choice.text ?? choice.message?.content ?? '')
    .filter((text) => text.length > 0)
    .join('')
}
