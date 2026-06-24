import { createFileRoute } from '@tanstack/react-router'
import { fetchBifrostModels } from '../../lib/bifrost.server'

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const models = await fetchBifrostModels()
          return Response.json({ models })
        } catch (error) {
          return Response.json(
            { error: getMessage(error, 'Unable to load models from Bifrost.') },
            { status: 503 },
          )
        }
      },
    },
  },
})

function getMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
