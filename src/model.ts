export type Point = { x: number; y: number }
export type Kind = 'rect' | 'ellipse' | 'diamond' | 'text' | 'line' | 'arrow' | 'pen'
export type Tool = 'select' | 'hand' | Kind
export type Direction = 'horizontal' | 'vertical'

export interface Shape {
  id: string
  kind: Kind
  x: number
  y: number
  width: number
  height: number
  rotation: number
  fill: string
  stroke: string
  strokeWidth: number
  color: string
  fontSize: number
  font: 'sans' | 'serif' | 'mono'
  align: 'left' | 'center' | 'right'
  bold: boolean
  radius: number
  dashed: boolean
  text: string
  points?: Point[]
  from?: string
  to?: string
  group?: string
  hidden?: boolean
}

export interface Diagram {
  version: 1
  id: string
  name: string
  width: number
  height: number
  background: string
  shapes: Shape[]
  updatedAt: string
}

export interface Library {
  active: string
  projects: Diagram[]
}

export const GRID = 16
export const FONT_STACKS = {
  sans: 'Inter, system-ui, Microsoft YaHei, PingFang SC, sans-serif',
  serif: 'Georgia, Songti SC, SimSun, serif',
  mono: 'Consolas, Microsoft YaHei, monospace',
}
export const KIND_NAMES: Record<Kind, string> = {
  rect: '矩形', ellipse: '椭圆', diamond: '菱形', text: '文本',
  line: '直线', arrow: '箭头', pen: '画笔',
}
export const COLORS = ['#ffffff', '#e4f4eb', '#d5edfc', '#ede6fb', '#fff0cf', '#fbe3e2', '#183f35', '#1f2824']
const STORE_KEY = 'ketu-studio:v1'

export const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now()
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
export const round = (n: number) => Math.round(n * 10) / 10
export const fitGrid = (n: number, snap: boolean) => snap ? Math.round(n / GRID) * GRID : round(n)
export const isLine = (shape: Shape) => shape.kind === 'line' || shape.kind === 'arrow'
export const isNode = (shape: Shape) => ['rect', 'ellipse', 'diamond'].includes(shape.kind)

export function shape(kind: Kind, x: number, y: number, options: Partial<Shape> = {}): Shape {
  return {
    id: uid(), kind, x, y, width: 160, height: 64, rotation: 0,
    fill: kind === 'text' ? 'none' : '#e4f4eb', stroke: '#78a58f', strokeWidth: 1.5,
    color: '#21483b', fontSize: 18, font: 'sans', align: 'center', bold: false,
    radius: 12, dashed: false, text: kind === 'text' ? '输入文字' : '',
    ...options,
  }
}

export function diagram(name = '未命名示意图', shapes: Shape[] = []): Diagram {
  return { version: 1, id: uid(), name, width: 960, height: 640, background: '#ffffff', shapes, updatedAt: new Date().toISOString() }
}

export function connector(from: Shape, to: Shape, options: Partial<Shape> = {}) {
  return shape('arrow', from.x + from.width / 2, from.y + from.height / 2, {
    width: to.x + to.width / 2 - from.x - from.width / 2,
    height: to.y + to.height / 2 - from.y - from.height / 2,
    from: from.id, to: to.id, stroke: '#7c998a', strokeWidth: 2, ...options,
  })
}

export const center = (node: Shape): Point => ({ x: node.x + node.width / 2, y: node.y + node.height / 2 })

export function rotateVector(vector: Point, degrees: number): Point {
  const radians = degrees * Math.PI / 180
  return { x: vector.x * Math.cos(radians) - vector.y * Math.sin(radians), y: vector.x * Math.sin(radians) + vector.y * Math.cos(radians) }
}

function anchor(node: Shape, towards: Point, inset: number): Point {
  const origin = center(node)
  const direction = rotateVector({ x: towards.x - origin.x, y: towards.y - origin.y }, -node.rotation)
  const x = Math.abs(direction.x) / Math.max(1, node.width / 2)
  const y = Math.abs(direction.y) / Math.max(1, node.height / 2)
  const distance = node.kind === 'ellipse' ? Math.hypot(x, y) : node.kind === 'diamond' ? x + y : Math.max(x, y)
  const length = Math.hypot(direction.x, direction.y)
  if (!distance || !length) return origin
  const factor = Math.min(1, 1 / distance + inset / length)
  const offset = rotateVector({ x: direction.x * factor, y: direction.y * factor }, node.rotation)
  return { x: origin.x + offset.x, y: origin.y + offset.y }
}

export function lineEnds(line: Shape, byId: Map<string, Shape>): [Point, Point] {
  const from = line.from ? byId.get(line.from) : undefined
  const to = line.to ? byId.get(line.to) : undefined
  const offset = rotateVector({ x: line.width / 2, y: line.height / 2 }, line.rotation)
  const middle = center(line)
  const a = from ? center(from) : { x: middle.x - offset.x, y: middle.y - offset.y }
  const b = to ? center(to) : { x: middle.x + offset.x, y: middle.y + offset.y }
  return [from ? anchor(from, b, 4) : a, to ? anchor(to, a, 7) : b]
}

export function bounds(item: Shape, byId: Map<string, Shape>) {
  if (isLine(item)) {
    const [a, b] = lineEnds(item, byId)
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
  }
  const c = center(item)
  const corner1 = rotateVector({ x: item.width / 2, y: item.height / 2 }, item.rotation)
  const corner2 = rotateVector({ x: -item.width / 2, y: item.height / 2 }, item.rotation)
  const halfWidth = Math.max(Math.abs(corner1.x), Math.abs(corner2.x))
  const halfHeight = Math.max(Math.abs(corner1.y), Math.abs(corner2.y))
  return { x: c.x - halfWidth, y: c.y - halfHeight, width: halfWidth * 2, height: halfHeight * 2 }
}

export function removeShapes(shapes: Shape[], ids: string[]) {
  const removed = new Set(ids)
  return shapes.filter(item => !removed.has(item.id) && !removed.has(item.from ?? '') && !removed.has(item.to ?? ''))
}

export function cloneShapes(shapes: Shape[], source: Shape[], offset = 24): Shape[] {
  const keys = new Map(source.map(item => [item.id, uid()]))
  const groups = new Map(source.flatMap(item => item.group ? [[item.group, uid()]] : []))
  const byId = new Map(shapes.map(item => [item.id, item]))
  return source.map(item => {
    const [a, b] = isLine(item) ? lineEnds(item, byId) : []
    return {
      ...item, id: keys.get(item.id)!, group: item.group ? groups.get(item.group) : undefined,
      x: (a?.x ?? item.x) + offset, y: (a?.y ?? item.y) + offset,
      width: a && b ? b.x - a.x : item.width, height: a && b ? b.y - a.y : item.height,
      rotation: a ? 0 : item.rotation,
      from: item.from ? keys.get(item.from) : undefined, to: item.to ? keys.get(item.to) : undefined,
    }
  })
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || !value || Array.isArray(value)) throw new Error('文件结构无效')
  return value as Record<string, unknown>
}

function numeric(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback
}

function paint(value: unknown, fallback: string, allowNone = false) {
  if (allowNone && value === 'none') return value
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback
}

function short(value: unknown, limit: number, fallback = '') {
  return typeof value === 'string' ? value.slice(0, limit) : fallback
}

export function parseDiagram(raw: unknown): Diagram {
  const data = record(raw)
  if (data.version !== 1 || !Array.isArray(data.shapes) || data.shapes.length > 1200) {
    throw new Error('请选择课图快画导出的 v1 项目文件（最多 1200 个对象）')
  }

  const ids = new Set<string>()
  const shapes = data.shapes.map(rawShape => {
    const item = record(rawShape)
    const kind = short(item.kind, 16) as Kind
    if (!Object.hasOwn(KIND_NAMES, kind)) throw new Error('项目包含未知的图形类型')
    const id = short(item.id, 100) || uid()
    if (ids.has(id)) throw new Error('项目文件中的对象编号重复')
    ids.add(id)
    const line = kind === 'line' || kind === 'arrow'
    const points = kind === 'pen' && Array.isArray(item.points) ? item.points.slice(0, 6000).map(value => {
      const point = record(value)
      return { x: numeric(point.x, 0, 1, 0), y: numeric(point.y, 0, 1, 0) }
    }) : undefined
    if (kind === 'pen' && (!points || points.length < 2)) throw new Error('画笔对象缺少轨迹')
    return shape(kind, numeric(item.x, -12000, 12000, 0), numeric(item.y, -12000, 12000, 0), {
      id, width: numeric(item.width, line ? -12000 : 1, 12000, 160),
      height: numeric(item.height, line ? -12000 : 1, 12000, 64),
      rotation: numeric(item.rotation, -360, 360, 0),
      fill: paint(item.fill, kind === 'text' ? 'none' : '#e4f4eb', true),
      stroke: paint(item.stroke, '#78a58f', true),
      color: paint(item.color, '#21483b'), strokeWidth: numeric(item.strokeWidth, 0, 32, 1.5),
      fontSize: numeric(item.fontSize, 8, 160, 18),
      font: item.font === 'serif' || item.font === 'mono' ? item.font : 'sans',
      align: item.align === 'left' || item.align === 'right' ? item.align : 'center',
      bold: item.bold === true, dashed: item.dashed === true, hidden: item.hidden === true,
      radius: numeric(item.radius, 0, 300, 12), text: short(item.text, 800),
      from: line ? short(item.from, 100) || undefined : undefined,
      to: line ? short(item.to, 100) || undefined : undefined,
      group: short(item.group, 100) || undefined, points,
    })
  })

  const nodes = new Set(shapes.filter(isNode).map(item => item.id))
  for (const item of shapes) {
    if (item.from && !nodes.has(item.from)) item.from = undefined
    if (item.to && !nodes.has(item.to)) item.to = undefined
  }
  return {
    version: 1, id: short(data.id, 100) || uid(),
    name: short(data.name, 80, '未命名示意图').trim() || '未命名示意图',
    width: numeric(data.width, 320, 3000, 960), height: numeric(data.height, 240, 2400, 640),
    background: paint(data.background, '#ffffff'),
    shapes, updatedAt: short(data.updatedAt, 40, new Date().toISOString()),
  }
}

export function readLibrary(seed: () => Diagram): Library {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const data = record(JSON.parse(raw))
      if (Array.isArray(data.projects) && data.projects.length) {
        const projects = data.projects.map(parseDiagram)
        const active = projects.find(item => item.id === data.active)?.id ?? projects[0].id
        return { active, projects }
      }
    }
  } catch (error) {
    console.warn('读取本地项目失败', error)
  }
  const first = seed()
  return { active: first.id, projects: [first] }
}

export function writeLibrary(library: Library) {
  localStorage.setItem(STORE_KEY, JSON.stringify(library))
}

export function fileTitle(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim() || '课图快画'
}
