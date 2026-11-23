import { clamp, connector, diagram, isNode, MAX_PAGE, shape, type Diagram, type Direction, type Shape } from './model'
import { makeNode } from './graphEdit'
import { findSymbol, symbols, type SymbolId } from './symbols'

interface Graph {
  title: string
  nodes: { id: string; label: string; type: SymbolId | 'step' }[]
  edges: { from: string; to: string; label?: string }[]
}

export const diagramFamilies = ['流程图', '系统架构图', '思维导图', '项目路线图', '实验流程图', '数据管道图'] as const
export type DiagramFamily = typeof diagramFamilies[number]
export const graphPrompt = '只输出 JSON 图结构，参考 {"title":"选题","nodes":[{"id":"a","label":"开始","type":"terminal"},{"id":"b","label":"调研","type":"process"}],"edges":[{"from":"a","to":"b","label":""}]}。使用 2–30 个节点、至多 80 条有向边、唯一的节点 id。连线引用现有节点，避免自环。条件分支用 label 标出。节点使用简明中文。type 可用：' +
  symbols.map(item => item.id + '（' + item.label + '）').join('、')

export function arrange(project: Diagram, direction: Direction): Diagram {
  const nodes = project.shapes.filter(item => !item.hidden && isNode(item))
  if (nodes.length < 2) return project

  const nodeIds = new Set(nodes.map(item => item.id))
  const edges = project.shapes.filter(item => !item.hidden && item.from && item.to && item.from !== item.to && nodeIds.has(item.from) && nodeIds.has(item.to))
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
  const width = clamp(Math.max(project.width, cols * cellWidth + 80), 320, MAX_PAGE.width)
  const height = clamp(Math.max(project.height, rows * cellHeight + 160), 240, MAX_PAGE.height)
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
    .filter(Boolean)
  if (steps.length < 2) throw new Error('请至少输入两个步骤，每行一个，或用 → 分隔。')
  if (steps.length > 30) throw new Error('每次可以生成最多 30 个节点。请缩短或拆分步骤。')
  const nodes = steps.map((label, index) => ({ id: String(index), label, type: /[？?]|^是否/.test(label) ? 'decision' as const : 'step' as const }))
  return fromGraph({ title, nodes, edges: nodes.slice(1).map((item, index) => ({ from: nodes[index].id, to: item.id })) }, direction)
}

function validateGraph(value: unknown): Graph {
  const graph = value as Partial<Graph> | null
  if (!graph || typeof graph.title !== 'string' || !Array.isArray(graph.nodes) ||
      graph.nodes.length < 2 || graph.nodes.length > 30 || !Array.isArray(graph.edges) || graph.edges.length > 80) {
    throw new Error('AI 返回的图结构无效，请缩短描述后重试。')
  }
  const keys = new Set<string>()
  for (const item of graph.nodes) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || keys.has(item.id) || typeof item.label !== 'string' || !item.label.trim()) {
      throw new Error('AI 返回了无效或重复的节点。')
    }
    keys.add(item.id)
  }
  for (const edge of graph.edges) {
    if (!edge || !keys.has(edge.from) || !keys.has(edge.to) || edge.from === edge.to) throw new Error('AI 返回了无效的连线。')
    if (edge.label !== undefined && typeof edge.label !== 'string') throw new Error('连线标签必须是文字。')
  }
  return graph as Graph
}

function fromGraph(graph: Graph, direction: Direction) {
  const title = graph.title.trim().slice(0, 60) || '我的流程图'
  const nodes = new Map(graph.nodes.map((item, index) => {
    const endpoint = index === 0 || index === graph.nodes.length - 1
    return [item.id, makeNode(findSymbol(item.type)?.id ?? (endpoint ? 'terminal' : 'process'), item.label.trim().slice(0, 100))]
  }))
  const titleShape = shape('text', 60, 44, { text: title, width: 810, height: 74, fontSize: 34, bold: true, align: 'left' })
  const seen = new Set<string>()
  const edges = graph.edges.flatMap(item => {
    const key = JSON.stringify([item.from, item.to])
    if (seen.has(key)) return []
    seen.add(key)
    return [connector(nodes.get(item.from)!, nodes.get(item.to)!, { text: item.label?.slice(0, 32) ?? '', route: 'elbow', fontSize: 13 })]
  })
  return arrange(diagram(title, [titleShape, ...edges, ...nodes.values()]), direction)
}

export function fromModelResult(content: string, direction: Direction) {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  let parsed: unknown
  try { parsed = JSON.parse(content.slice(start, end + 1)) } catch { throw new Error('找不到有效的 JSON 图结构。可以复制窗口中的提示词重新生成。') }
  return fromGraph(validateGraph(parsed), direction)
}

export async function fromAI(text: string, direction: Direction, family: DiagramFamily,
  config: { endpoint: string; model: string; key: string }, signal: AbortSignal) {
  let url: URL
  try { url = new URL(config.endpoint.trim(), location.href) } catch { throw new Error('请输入完整的接口 URL。') }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) throw new Error('请输入 HTTPS 接口地址。本机服务可以使用 HTTP。')
  if (url.username || url.password) throw new Error('请把密钥填写在独立字段中。')
  if (!config.model.trim()) throw new Error('请输入模型名称。')
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
      headers: { 'Content-Type': 'application/json', ...(config.key ? { Authorization: 'Bearer ' + config.key } : {}) },
      body: JSON.stringify({
        model: config.model.trim(),
        messages: [
          { role: 'system', content: graphPrompt },
          { role: 'user', content: '图形类型：' + family + '\n需求：' + text.slice(0, 6000) },
        ],
      }),
    })
  } catch {
    if (signal.aborted) throw new Error('已取消生成。')
    throw new Error('连接失败或响应超时。请检查网络、模型接口和跨域设置。')
  }
  if (!response.ok) {
    const advice = response.status === 401 || response.status === 403 ? '请核对 API 密钥和权限。'
      : response.status === 404 ? '请核对接口 URL 和模型 ID。'
        : response.status === 429 ? '模型当前繁忙，或已达到服务额度。'
          : response.status === 502 && url.pathname === '/__ketu-model/qwen'
            ? '请启动课图快画的本机 Qwen 服务。' : '请检查模型服务是否可用。'
    throw new Error('模型请求失败（HTTP ' + response.status + '）。' + advice)
  }
  let result
  try { result = await response.json() } catch { throw new Error('该地址未返回模型 JSON。请检查接口路径。') }
  const content: unknown = result?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('模型接口没有返回文本。')
  return fromModelResult(content.replace(/<think>[\s\S]*?<\/think>/gi, ''), direction)
}
