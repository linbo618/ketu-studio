import http from 'node:http'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getLlama, LlamaChatSession } from 'node-llama-cpp'

const defaultModel = fileURLToPath(new URL('./models/qwen-0.5b.gguf', import.meta.url))
const modelPath = process.argv[2] ? resolve(process.argv[2]) : defaultModel
try { await access(modelPath) } catch {
  console.error('找不到模型文件。请按 README 下载 Qwen GGUF，或传入已下载的模型路径。')
  process.exit(1)
}

const llama = await getLlama({ gpu: false, logLevel: 'error' })
const model = await llama.loadModel({ modelPath })
const context = await model.createContext({ contextSize: 4096, threads: 6 })
const kinds = ['terminal', 'process', 'decision', 'database', 'document', 'actor', 'component', 'topic',
  'input', 'subprocess', 'delay', 'cloud', 'queue', 'interface', 'concept', 'note', 'milestone', 'task']
const text = maxLength => ({ type: 'string', maxLength })
const grammar = await llama.createGrammarForJsonSchema({
  type: 'object', properties: {
    title: text(72),
    nodes: { type: 'array', minItems: 2, maxItems: 14, items: { type: 'object', properties: {
      id: text(12), label: text(72), type: { enum: kinds },
    } } },
    edges: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', properties: {
      from: text(12), to: text(12),
    } } },
  },
})

const example = '{"title":"作业提交","nodes":[{"id":"1","label":"准备文件","type":"process"},{"id":"2","label":"上传作业","type":"process"}],"edges":[{"from":"1","to":"2"}]}'
const systemPrompt = '根据用户需求生成中文的有向流程图 JSON。节点编号用连续数字字符串，edges 必须引用已有 nodes 的 id。JSON 示例：' + example
let processing = false

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? ''
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin)) {
    res.writeHead(403).end()
    return
  }
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(204, { ...headers, 'X-Ketu-Local-Model': 'qwen' }).end()
    return
  }
  if (req.url !== '/v1/chat/completions') { res.writeHead(404, headers).end(); return }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }).end()
    return
  }
  if (req.method !== 'POST') { res.writeHead(405, headers).end(); return }
  if (processing) { res.writeHead(429, headers).end('{}'); return }
  processing = true
  const controller = new AbortController()
  res.on('close', () => controller.abort())
  let sequence
  try {
    let body = ''
    let size = 0
    req.setEncoding('utf8')
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk)
      if (size > 64000) { res.writeHead(413, headers).end('{}'); return }
      body += chunk
    }
    const messages = JSON.parse(body)?.messages
    const brief = Array.isArray(messages) ? messages.findLast(item => item?.role === 'user')?.content : undefined
    if (typeof brief !== 'string' || !brief.trim()) { res.writeHead(400, headers).end('{}'); return }
    sequence = context.getSequence()
    const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt })
    const content = await session.prompt(brief.slice(0, 2600), {
      grammar, maxTokens: 1000, temperature: 0.25, seed: 9,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(82000)]),
    })
    res.writeHead(200, headers).end(JSON.stringify({ choices: [{ message: { content } }] }))
  } catch {
    if (!res.destroyed) res.writeHead(500, headers).end('{}')
  } finally {
    sequence?.dispose()
    processing = false
  }
})
server.listen(11435, '127.0.0.1', () => console.log('课图快画本机模型已启动 http://127.0.0.1:11435'))
