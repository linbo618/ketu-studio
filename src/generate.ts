import { clamp, connector, diagram, isNode, shape, type Diagram, type Direction, type Shape } from './model'

interface Graph {
  title: string
  nodes: { id: string; label: string; type: 'step' | 'decision' }[]
  edges: { from: string; to: string }[]
}

export function arrange(project: Diagram, direction: Direction): Diagram {
  const nodes = project.shapes.filter(item => !item.hidden && isNode(item))
  if (nodes.length < 2) return project

  const edges = project.shapes.filter(item => !item.hidden && item.from && item.to && item.from !== item.to)
  const levels = new Map(nodes.map(item => [item.id, 0]))
  const incoming = new Map(nodes.map(item => [item.id, 0]))
  const outgoing = new Map(nodes.map(item => [item.id, new Set<string>()]))
  for (const edge of edges) {
    const targets = outgoing.get(edge.from!)
    if (!targets || !incoming.has(edge.to!) || targets.has(edge.to!)) continue
    targets.add(edge.to!)
    incoming.set(edge.to!, incoming.get(edge.to!)! + 1)
  }

  const ready = nodes.filter(item => !incoming.get(item.id)).map(item => item.id)
  const ordered = new Set<string>()
  let nextBranch = 0
  for (let i = 0; i < nodes.length; i++) {
    while (nextBranch < nodes.length && ordered.has(nodes[nextBranch].id)) nextBranch++
    const id = ready.shift() ?? nodes[nextBranch].id
    ordered.add(id)
    for (const target of outgoing.get(id)!) {
      if (ordered.has(target)) continue
      levels.set(target, Math.max(levels.get(target)!, levels.get(id)! + 1))
      const remaining = incoming.get(target)! - 1
      incoming.set(target, remaining)
      if (remaining === 0) ready.push(target)
    }
  }

  const lanes = new Map<number, Shape[]>()
  for (const item of nodes) {
    const level = edges.length ? levels.get(item.id)! : nodes.indexOf(item)
    const lane = lanes.get(level) ?? []
    lane.push(item)
    lanes.set(level, lane)
  }

  const vertical = direction === 'vertical'
  const largestLane = Math.max(...Array.from(lanes.values(), lane => lane.length))
  const cellWidth = Math.max(...nodes.map(item => item.width), 140) + 56
  const cellHeight = Math.max(...nodes.map(item => item.height), 62) + 48
  const rows = vertical ? lanes.size : largestLane
  const cols = vertical ? largestLane : lanes.size
  const width = clamp(Math.max(project.width, cols * cellWidth + 80), 320, 3000)
  const height = clamp(Math.max(project.height, rows * cellHeight + 160), 240, 2400)
  const positions = new Map<string, { x: number; y: number }>()
  const gridWidth = Math.min(cellWidth, (width - 100) / cols)
  const gridHeight = Math.min(cellHeight, (height - 170) / rows)
  for (const [level, lane] of lanes) {
    lane.forEach((item, index) => {
      const col = vertical ? index + (cols - lane.length) / 2 : level
      const row = vertical ? level : index + (rows - lane.length) / 2
      positions.set(item.id, {
        x: Math.round((width - cols * gridWidth) / 2 + (col + .5) * gridWidth - item.width / 2),
        y: Math.round((height + 140 - rows * gridHeight) / 2 + (row + .5) * gridHeight - item.height / 2),
      })
    })
  }
  return { ...project, width, height, shapes: project.shapes.map(item => ({ ...item, ...positions.get(item.id) })) }
}

export function fromOutline(text: string, direction: Direction) {
  const [firstLine, ...rest] = text.trim().split(/\r?\n/)
  const hasTitle = /^(?:标题|主题)\s*[：:]/.test(firstLine)
  const title = hasTitle ? firstLine.replace(/^(?:标题|主题)\s*[：:]\s*/, '').slice(0, 60) : '我的流程图'
  const steps = (hasTitle ? rest : [firstLine, ...rest]).join('\n')
    .split(/\n|→|->|[；、;]|然后|接着|最后/)
    .map(line => line.trim().replace(/^(?:[-*•]\s*|\d+[.、)\s]\s*)/, '').replace(/[。！!]$/, ''))
    .filter(Boolean).slice(0, 16)
  if (steps.length < 2) throw new Error('请至少输入两个步骤，每行一个，或用 → 分隔。')
  const nodes = steps.map((label, index) => ({ id: String(index), label, type: /[？?]|^是否/.test(label) ? 'decision' as const : 'step' as const }))
  return fromGraph({ title, nodes, edges: nodes.slice(1).map((item, index) => ({ from: nodes[index].id, to: item.id })) }, direction)
}

function validateGraph(value: unknown): Graph {
  const graph = value as Partial<Graph> | null
  if (!graph || typeof graph.title !== 'string' || !Array.isArray(graph.nodes) ||
      graph.nodes.length < 2 || graph.nodes.length > 16 || !Array.isArray(graph.edges) || graph.edges.length > 32) {
    throw new Error('AI 返回的图结构无效，请缩短描述后重试。')
  }
  const keys = new Set<string>()
  for (const item of graph.nodes) {
    if (!item || typeof item.id !== 'string' || keys.has(item.id) || typeof item.label !== 'string' || !item.label.trim()) {
      throw new Error('AI 返回了无效或重复的节点。')
    }
    keys.add(item.id)
  }
  for (const edge of graph.edges) {
    if (!edge || !keys.has(edge.from) || !keys.has(edge.to) || edge.from === edge.to) throw new Error('AI 返回了无效的连线。')
  }
  return graph as Graph
}

function fromGraph(graph: Graph, direction: Direction) {
  const title = graph.title.trim().slice(0, 60) || '我的流程图'
  const nodes = new Map(graph.nodes.map((item, index) => {
    const decision = item.type === 'decision'
    const endpoint = index === 0 || index === graph.nodes.length - 1
    return [item.id, shape(decision ? 'diamond' : 'rect', 0, 0, {
      text: item.label.trim().slice(0, 64), bold: true, width: decision ? 176 : 158,
      height: decision ? 104 : 74, fontSize: 17, radius: endpoint ? 32 : 12,
      fill: decision ? '#fff0cf' : endpoint ? '#195a46' : '#e4f4eb',
      stroke: decision ? '#dcc38a' : endpoint ? '#195a46' : '#9bc1a9',
      color: decision ? '#685220' : endpoint ? '#ffffff' : '#21483b',
    })]
  }))
  const titleShape = shape('text', 60, 44, { text: title, width: 810, height: 74, fontSize: 34, bold: true, align: 'left' })
  const edges = graph.edges.map(item => connector(nodes.get(item.from)!, nodes.get(item.to)!))
  return arrange(diagram(title, [titleShape, ...edges, ...nodes.values()]), direction)
}

export async function fromAI(text: string, direction: Direction, config: { endpoint: string; model: string; key: string }) {
  const url = new URL(config.endpoint.trim())
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('请输入 HTTPS 接口地址。开发环境可使用本机 HTTP 地址。')
  }
  if (url.username || url.password) throw new Error('请把密钥填写在独立字段中。')
  if (!config.model.trim()) throw new Error('请输入模型名称。')
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25_000),
      headers: { 'Content-Type': 'application/json', ...(config.key ? { Authorization: 'Bearer ' + config.key } : {}) },
      body: JSON.stringify({
        model: config.model.trim(),
        messages: [
          { role: 'system', content: '把描述变成可读流程图，只输出 JSON。结构：{"title":"标题","nodes":[{"id":"a","label":"步骤","type":"step"}],"edges":[{"from":"a","to":"b"}]}。节点 2–16 个，type 为 step 或 decision。连线引用有效的节点 id，避免自环。' },
          { role: 'user', content: text.slice(0, 3000) },
        ],
      }),
    })
  } catch {
    throw new Error('无法连接模型服务。请检查网络、接口地址和服务的跨域设置。')
  }
  if (!response.ok) throw new Error('模型接口请求失败（HTTP ' + response.status + '）。')
  const result = await response.json()
  const content: unknown = result?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('模型接口没有返回文本。')
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '')
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { throw new Error('模型未返回可读取的 JSON，请重试。') }
  return fromGraph(validateGraph(parsed), direction)
}
