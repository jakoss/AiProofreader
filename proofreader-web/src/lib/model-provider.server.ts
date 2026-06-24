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
