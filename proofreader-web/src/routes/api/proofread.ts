import { createFileRoute } from '@tanstack/react-router'
import {
  proofreadWithModelProvider,
  streamProofreadWithModelProvider,
} from '../../lib/model-provider.server'
import { modeIds, type ProofreadMode } from '../../lib/modes'
import type { ProofreadStreamEvent } from '../../lib/types'

type ProofreadRequest = {
  text?: unknown
  mode?: unknown
  stream?: unknown
}

export const Route = createFileRoute('/api/proofread')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: ProofreadRequest

        try {
          body = (await request.json()) as ProofreadRequest
        } catch {
          return Response.json(
            { error: 'Request body must be valid JSON.' },
            { status: 400 },
          )
        }

        const validationError = validateBody(body)
        if (validationError) {
          return Response.json({ error: validationError }, { status: 400 })
        }

        try {
          if (body.stream === true) {
            return streamProofreadResponse({
              text: body.text as string,
              mode: body.mode as ProofreadMode,
              signal: request.signal,
            })
          }

          const correctedText = await proofreadWithModelProvider({
            text: body.text as string,
            mode: body.mode as ProofreadMode,
          })

          return Response.json({ correctedText })
        } catch (error) {
          return Response.json(
            { error: getMessage(error, 'Proofreading failed.') },
            { status: 502 },
          )
        }
      },
    },
  },
})

function validateBody(body: ProofreadRequest) {
  if (typeof body.text !== 'string' || !body.text.trim()) {
    return 'Text is required.'
  }

  if (typeof body.mode !== 'string' || !modeIds.includes(body.mode as ProofreadMode)) {
    return 'Mode must be typos, improve, or lightRewrite.'
  }

  if (typeof body.stream !== 'undefined' && typeof body.stream !== 'boolean') {
    return 'Stream must be true or false.'
  }

  return ''
}

function getMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function streamProofreadResponse(input: {
  text: string
  mode: ProofreadMode
  signal: AbortSignal
}) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let correctedText = ''

      function send(event: ProofreadStreamEvent) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }

      try {
        for await (const delta of streamProofreadWithModelProvider(input)) {
          correctedText += delta
          send({ type: 'delta', text: delta })
        }

        send({ type: 'done', correctedText: correctedText.trim() })
      } catch (error) {
        if (!input.signal.aborted) {
          send({ type: 'error', error: getMessage(error, 'Proofreading failed.') })
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  })
}
