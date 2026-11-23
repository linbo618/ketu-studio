import { defineConfig, type Connect, type Plugin } from 'vite'

function modelBridge(): Plugin {
  const providers = new Map([
    ['qwen', 'http://127.0.0.1:11435/v1/chat/completions'],
    ['ollama', 'http://127.0.0.1:11434/v1/chat/completions'],
    ['deepseek', 'https://api.deepseek.com/chat/completions'],
    ['openai', 'https://api.openai.com/v1/chat/completions'],
  ])
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const match = /^\/__ketu-model\/([a-z]+)$/.exec(req.url ?? '')
    if (!match) return next()
    const host = req.headers.host ?? ''
    const client = req.socket.remoteAddress ?? ''
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
        !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(client)) {
      res.writeHead(403).end()
      return
    }
    if (match[1] === 'health' && req.method === 'GET') {
      res.writeHead(204, { 'X-Ketu-Model-Bridge': 'available' }).end()
      return
    }
    if (match[1] === 'local' && req.method === 'GET') {
      try {
        const response = await fetch('http://127.0.0.1:11435/health', { signal: AbortSignal.timeout(900) })
        res.writeHead(response.ok && response.headers.get('x-ketu-local-model') === 'qwen' ? 204 : 503).end()
      } catch { res.writeHead(503).end() }
      return
    }
    const target = providers.get(match[1])
    if (!target) { res.writeHead(404).end(); return }
    if (req.method !== 'POST' || req.headers.origin !== 'http://' + host || !req.headers['content-type']?.startsWith('application/json')) {
      res.writeHead(403).end()
      return
    }
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    try {
      let body = ''
      let bytes = 0
      req.setEncoding('utf8')
      for await (const chunk of req) {
        bytes += Buffer.byteLength(chunk)
        if (bytes > 64000) {
          res.writeHead(413).end()
          return
        }
        body += chunk
      }
      const authorization = req.headers.authorization
      const response = await fetch(target, {
        method: 'POST', redirect: 'error', body,
        headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(88000)]),
      })
      res.writeHead(response.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(await response.text())
    } catch {
      if (res.headersSent || res.destroyed) { res.destroy(); return }
      res.writeHead(502).end()
    }
  }
  return {
    name: 'ketu-local-model-bridge',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}

export default defineConfig({ base: './', plugins: [modelBridge()] })
