import { promptTemplates, type ProofreadMode } from './modes'
import type { ModelInfo } from './types'

const DEFAULT_BIFROST_BASE_URL = 'http://localhost:8080/v1'

type OpenAiModelResponse = {
  data?: Array<{ id?: string; name?: string }>
  models?: Array<{ id?: string; name?: string }>
}

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

export async function fetchBifrostModels(): Promise<ModelInfo[]> {
  const response = await fetchFromBifrost('/models')

  if (!response.ok) {
    throw new Error(`Bifrost models request failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as OpenAiModelResponse
  const rawModels = Array.isArray(payload.data) ? payload.data : payload.models

  if (!Array.isArray(rawModels)) {
    throw new Error('Bifrost returned an invalid models response.')
  }

  return rawModels
    .map((model) => {
      const id = typeof model.id === 'string' ? model.id : ''
      const name = typeof model.name === 'string' ? model.name : id
      return { id, name }
    })
    .filter((model) => model.id)
}

export async function proofreadWithBifrost(input: {
  text: string
  mode: ProofreadMode
  model: string
}) {
  const prompt = promptTemplates[input.mode].replace('{{text}}', input.text)

  const response = await fetchFromBifrost('/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
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
    throw new Error('Bifrost returned an invalid proofreading response.')
  }

  return correctedText.trim()
}

function getBifrostBaseUrl() {
  return (process.env.BIFROST_BASE_URL ?? DEFAULT_BIFROST_BASE_URL).replace(/\/$/, '')
}

async function fetchFromBifrost(path: string, init?: RequestInit) {
  try {
    return await fetch(`${getBifrostBaseUrl()}${path}`, init)
  } catch {
    throw new Error('Bifrost is unavailable or the model provider did not respond.')
  }
}

function mapGatewayError(status: number) {
  if (status === 413 || status === 422) {
    return 'The text may be too large for the selected model context window.'
  }

  if (status === 502 || status === 503 || status === 504) {
    return 'Bifrost is unavailable or the model provider did not respond.'
  }

  return `Bifrost request failed with status ${status}.`
}
