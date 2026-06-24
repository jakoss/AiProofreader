import { createFileRoute } from '@tanstack/react-router'
import { proofreadWithBifrost } from '../../lib/bifrost.server'
import { modeIds, type ProofreadMode } from '../../lib/modes'

type ProofreadRequest = {
  text?: unknown
  mode?: unknown
  model?: unknown
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
          const correctedText = await proofreadWithBifrost({
            text: body.text as string,
            mode: body.mode as ProofreadMode,
            model: body.model as string,
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

  if (typeof body.model !== 'string' || !body.model.trim()) {
    return 'Model is required.'
  }

  if (typeof body.mode !== 'string' || !modeIds.includes(body.mode as ProofreadMode)) {
    return 'Mode must be typos, improve, or lightRewrite.'
  }

  return ''
}

function getMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
