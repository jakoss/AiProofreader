import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { Readable } from 'node:stream'
import startServer from './dist/server/server.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'
const clientRoot = resolve('dist/client')

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
])

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const staticResponse = serveStatic(req)
      if (staticResponse) {
        res.writeHead(staticResponse.status, staticResponse.headers)
        if (req.method === 'GET') {
          staticResponse.stream.pipe(res)
        } else {
          res.end()
        }
        return
      }
    }

    const response = await startServer.fetch(toFetchRequest(req))
    await writeFetchResponse(res, response)
  } catch (error) {
    console.error(error)
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Internal server error.' }))
  }
}).listen(port, host, () => {
  console.log(`Proofreader listening on http://${host}:${port}`)
})

function serveStatic(req) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (!url.pathname.startsWith('/assets/')) {
    return null
  }

  const filePath = normalize(join(clientRoot, decodeURIComponent(url.pathname)))
  if (!filePath.startsWith(clientRoot) || !existsSync(filePath)) {
    return null
  }

  const stats = statSync(filePath)
  if (!stats.isFile()) {
    return null
  }

  return {
    status: 200,
    headers: {
      'Content-Type': mimeTypes.get(extname(filePath)) ?? 'application/octet-stream',
      'Content-Length': String(stats.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    stream: createReadStream(filePath),
  }
}

function toFetchRequest(req) {
  const protocol = req.headers['x-forwarded-proto'] ?? 'http'
  const hostHeader = req.headers.host ?? `localhost:${port}`
  const url = `${protocol}://${hostHeader}${req.url ?? '/'}`
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else if (typeof value === 'string') {
      headers.set(key, value)
    }
  }

  return new Request(url, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req),
    duplex: 'half',
  })
}

async function writeFetchResponse(res, response) {
  const headers = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  res.writeHead(response.status, headers)

  if (!response.body) {
    res.end()
    return
  }

  for await (const chunk of response.body) {
    res.write(chunk)
  }

  res.end()
}
