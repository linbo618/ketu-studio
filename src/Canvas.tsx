import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { Blocks, Plus } from 'lucide-react'
import { Drawing } from './Drawing'
import { bounds, center, connector, fitGrid, isLine, isNode, lineEnds, rotateVector, round, shape, type Diagram, type Point, type Shape, type Tool } from './model'
import { addLink, nearestNode, type Side } from './graphEdit'

type Gesture = {
  mode: 'pan' | 'draw' | 'move' | 'rotate' | 'resize' | 'marquee' | 'link' | 'endpoint'
  start: Point
  client: Point
  pan?: Point
  ids?: string[]
  item?: Shape
  target?: Shape
  points?: Point[]
  add?: boolean
  side?: Side
  corner?: 'nw' | 'ne' | 'sw' | 'se'
  nodeClick?: boolean
  endpoint?: 'from' | 'to'
}

interface Props {
  project: Diagram
  svgRef: RefObject<SVGSVGElement | null>
  tool: Tool
  selected: string[]
  onSelect: (ids: string[]) => void
  onCommit: (shapes: Shape[], selected?: string[]) => void
  onFinishTool: () => void
  onEdit: () => void
  zoom: number
  onZoom: (value: number) => void
  grid: boolean
  snap: boolean
  reset: number
  onTemplates: () => void
  onExpand: (point: Point, node?: Shape, side?: Side) => void
  onText: (id: string, text: string) => void
}

const origin = { x: 0, y: 0 }
const ports: { side: Side; x: number; y: number }[] = [
  { side: 'right', x: 1, y: 0 }, { side: 'bottom', x: 0, y: 1 },
  { side: 'left', x: -1, y: 0 }, { side: 'top', x: 0, y: -1 },
]

export default function Canvas({ project, svgRef, tool, selected, onSelect, onCommit, onFinishTool, onEdit, zoom, onZoom, grid, snap, reset, onTemplates, onExpand, onText }: Props) {
  const view = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [size, setSize] = useState({ x: 720, y: 520 })
  const [pan, setPan] = useState<Point>(origin)
  const [preview, setPreview] = useState<Shape[] | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number }>()
  const [pending, setPending] = useState<string>()
  const [space, setSpace] = useState(false)
  const [grabbing, setGrabbing] = useState(false)
  const [link, setLink] = useState<{ from: Point; to: Point; target?: string }>()
  const [hoveredNode, setHoveredNode] = useState<string>()
  const [editing, setEditing] = useState<{ item: Shape; text: string }>()
  const editor = useRef<HTMLTextAreaElement>(null)
  const paddingX = size.x < 500 ? 20 : 52
  const scale = Math.max(.08, Math.min((size.x - paddingX) / project.width, (size.y - 64) / project.height, 1.2)) * zoom
  const paperWidth = project.width * scale
  const paperHeight = project.height * scale
  const activeNode = tool === 'select' && selected.length === 1 && !preview && !editing
    ? project.shapes.find(item => item.id === selected[0] && isNode(item) && !item.hidden) : undefined
  const connectionNode = tool === 'arrow'
    ? project.shapes.find(item => item.id === (hoveredNode ?? pending) && isNode(item) && !item.hidden)
    : undefined

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ x: entry.contentRect.width, y: entry.contentRect.height }))
    if (view.current) observer.observe(view.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => { setPan(origin) }, [project.id, reset])
  useEffect(() => { setPending(undefined); setHoveredNode(undefined); setEditing(undefined) }, [project.id, tool])
  useEffect(() => {
    if (editing && document.activeElement !== editor.current) {
      editor.current?.focus()
      editor.current?.select()
    }
  }, [editing])
  useEffect(() => {
    function enter(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || !activeNode || (event.target as Element)?.closest('button,input,textarea,select,dialog')) return
      event.preventDefault()
      setEditing({ item: activeNode, text: activeNode.text })
    }
    window.addEventListener('keydown', enter)
    return () => window.removeEventListener('keydown', enter)
  }, [activeNode])
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.code !== 'Space' || (event.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable],dialog')) return
      event.preventDefault()
      setSpace(event.type === 'keydown')
    }
    const clear = () => setSpace(false)
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', key)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('keyup', key)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useEffect(() => {
    const element = view.current
    function wheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      onZoom(zoom + (event.deltaY < 0 ? .1 : -.1))
    }
    element?.addEventListener('wheel', wheel, { passive: false })
    return () => element?.removeEventListener('wheel', wheel)
  }, [zoom, onZoom])

  function locate(clientX: number, clientY: number): Point {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left) / rect.width * project.width, y: (clientY - rect.top) / rect.height * project.height }
  }

  function getTarget(element: Element | null) {
    const id = element?.closest('[data-shape]')?.getAttribute('data-shape')
    return project.shapes.find(item => item.id === id)
  }

  function position(item: Shape, side: Side, gap: number) {
    const port = ports.find(item => item.side === side)!
    const c = center(item)
    const rect = bounds(item, new Map())
    return { x: c.x + port.x * (rect.width / 2 + gap), y: c.y + port.y * (rect.height / 2 + gap) }
  }

  function beginLink(event: ReactPointerEvent<HTMLButtonElement>, item: Shape, side: Side) {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    gesture.current = { mode: 'link', item, side, start: position(item, side, 0), client: { x: event.clientX, y: event.clientY } }
    view.current?.setPointerCapture(event.pointerId)
  }

  function finishNodeLink(item: Shape) {
    const source = pending ? project.shapes.find(shape => shape.id === pending && isNode(shape)) : undefined
    if (!source) {
      setPending(item.id)
      onSelect([item.id])
      return
    }
    if (source.id === item.id) {
      setPending(undefined)
      onSelect([item.id])
      return
    }
    const shapes = addLink(project.shapes, source, item, { route: 'elbow' })
    if (shapes !== project.shapes) onCommit(shapes, [item.id])
    setPending(undefined)
    onSelect([item.id])
  }

  function moveEndpoint(g: Gesture, point: Point) {
    const item = g.item!
    const byId = new Map(project.shapes.map(shape => [shape.id, shape]))
    const [oldFrom, oldTo] = lineEnds(item, byId)
    const otherNode = g.endpoint === 'from' ? item.to : item.from
    const snapped = nearestNode(project, point, otherNode ?? item.id, 24 / scale)
    const nextFrom = g.endpoint === 'from' ? snapped?.id : item.from
    const nextTo = g.endpoint === 'to' ? snapped?.id : item.to
    const from = g.endpoint === 'from' ? snapped ? center(snapped) : point : oldFrom
    const to = g.endpoint === 'to' ? snapped ? center(snapped) : point : oldTo
    const shapes = project.shapes.map(shape => shape.id === item.id ? {
      ...shape, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2,
      width: to.x - from.x, height: to.y - from.y, rotation: 0,
      from: nextFrom, to: nextTo,
    } : shape)
    return { shapes, snapped }
  }

  function start(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return
    const target = event.target as Element
    if (target.closest('button')) return
    const startPoint = locate(event.clientX, event.clientY)
    const client = { x: event.clientX, y: event.clientY }
    const item = getTarget(target)
    const handle = target.getAttribute('data-handle')
    const corner = target.getAttribute('data-corner') as Gesture['corner']
    const endpoint = target.getAttribute('data-endpoint') as Gesture['endpoint']
    const add = event.shiftKey
    let next: Gesture
    if (tool === 'hand' || event.button === 1 || space) {
      setGrabbing(true)
      next = { mode: 'pan', start: startPoint, client, pan }
    } else if (tool === 'arrow' && item && isNode(item)) {
      event.preventDefault()
      gesture.current = { mode: 'link', item, start: center(item), client, nodeClick: true }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    } else if (tool !== 'select' && target.closest('svg[data-diagram]')) {
      const point = { x: fitGrid(startPoint.x, snap && tool !== 'pen'), y: fitGrid(startPoint.y, snap && tool !== 'pen') }
      next = { mode: 'draw', start: point, client, item: shape(tool, point.x, point.y), target: tool === 'arrow' && item && isNode(item) ? item : undefined, points: [startPoint] }
    } else if (tool === 'select' && item && handle === 'endpoint' && endpoint) {
      onSelect([item.id])
      next = { mode: 'endpoint', start: startPoint, client, item, ids: [item.id], endpoint }
    } else if (tool === 'select' && item) {
      const group = item.group ? project.shapes.filter(other => !other.hidden && other.group === item.group).map(other => other.id) : [item.id]
      const ids = add
        ? selected.includes(item.id) ? selected.filter(id => !group.includes(id)) : [...new Set([...selected, ...group])]
        : selected.includes(item.id) ? selected : group
      onSelect(ids)
      next = { mode: handle === 'rotate' || handle === 'resize' ? handle : 'move', start: startPoint, client, item, ids, corner }
    } else if (tool === 'select') {
      if (!add) onSelect([])
      next = { mode: 'marquee', start: startPoint, client, add }
    } else return
    event.preventDefault()
    gesture.current = next
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function draw(g: Gesture, point: Point, moved: boolean, endTarget?: Shape): Shape | undefined {
    const item = g.item!
    const to = { x: fitGrid(point.x, snap), y: fitGrid(point.y, snap) }
    const x = Math.min(g.start.x, to.x)
    const y = Math.min(g.start.y, to.y)
    const width = Math.abs(g.start.x - to.x)
    const height = Math.abs(g.start.y - to.y)
    if (item.kind === 'pen') {
      const points = g.points!
      if (points.length < 2) return undefined
      const x = Math.min(...points.map(item => item.x))
      const y = Math.min(...points.map(item => item.y))
      const width = Math.max(1, Math.max(...points.map(item => item.x)) - x)
      const height = Math.max(1, Math.max(...points.map(item => item.y)) - y)
      return { ...item, x, y, width, height, stroke: '#285b48', strokeWidth: 3, points: points.map(p => ({ x: (p.x - x) / width, y: (p.y - y) / height })) }
    }
    if (isLine(item)) {
      if (item.kind === 'arrow' && g.target && endTarget && g.target.id !== endTarget.id) return connector(g.target, endTarget, { id: item.id })
      const start = g.target ? center(g.target) : g.start
      const end = endTarget && endTarget.id !== g.target?.id ? center(endTarget) : to
      return {
        ...item, x: start.x, y: start.y, width: moved ? end.x - start.x : 120, height: moved ? end.y - start.y : 0,
        stroke: '#45745f', strokeWidth: 2, from: item.kind === 'arrow' ? g.target?.id : undefined,
        to: item.kind === 'arrow' && endTarget?.id !== g.target?.id ? endTarget?.id : undefined,
      }
    }
    return moved ? { ...item, x, y, width: Math.max(18, width), height: Math.max(16, height) } : item
  }

  function transformed(g: Gesture, point: Point) {
    const delta = { x: point.x - g.start.x, y: point.y - g.start.y }
    const original = g.item!
    const dx = fitGrid(original.x + delta.x, snap) - original.x
    const dy = fitGrid(original.y + delta.y, snap) - original.y
    return project.shapes.map(item => {
      if (!g.ids?.includes(item.id)) return item
      if (g.mode === 'move') return isLine(item) && (item.from || item.to) ? item : { ...item, x: round(item.x + dx), y: round(item.y + dy) }
      const c = center(item)
      if (g.mode === 'rotate') {
        const angle = Math.atan2(point.y - c.y, point.x - c.x) - Math.atan2(g.start.y - c.y, g.start.x - c.x)
        return { ...item, rotation: round((item.rotation + angle * 180 / Math.PI) % 360) }
      }
      const local = rotateVector({ x: point.x - c.x, y: point.y - c.y }, -item.rotation)
      const corner = g.corner ?? 'se'
      const signX = corner.includes('e') ? 1 : -1
      const signY = corner.includes('s') ? 1 : -1
      const opposite = { x: -signX * item.width / 2, y: -signY * item.height / 2 }
      const pointer = { x: signX * Math.max(7, Math.abs(local.x)), y: signY * Math.max(7, Math.abs(local.y)) }
      const width = Math.max(14, fitGrid(Math.abs(pointer.x - opposite.x), snap))
      const height = Math.max(14, fitGrid(Math.abs(pointer.y - opposite.y), snap))
      const newCenter = rotateVector({ x: (pointer.x + opposite.x) / 2, y: (pointer.y + opposite.y) / 2 }, item.rotation)
      return { ...item, width, height, x: round(c.x + newCenter.x - width / 2), y: round(c.y + newCenter.y - height / 2) }
    })
  }

  function update(event: ReactPointerEvent<HTMLDivElement>, final: boolean) {
    const g = gesture.current
    if (!g) return
    const delta = { x: event.clientX - g.client.x, y: event.clientY - g.client.y }
    const moved = Math.hypot(delta.x, delta.y) > 3
    const point = locate(event.clientX, event.clientY)
    if (g.mode === 'endpoint') {
      const result = moveEndpoint(g, point)
      if (final) onCommit(result.shapes, [g.item!.id])
      else setPreview(result.shapes)
    } else if (g.mode === 'link') {
      const from = g.item!
      const target = moved ? nearestNode(project, point, from.id, 20 / scale) : undefined
      if (!final) setLink({ from: g.start, to: target ? center(target) : point, target: target?.id })
      else if (!moved && g.nodeClick) {
        finishNodeLink(from)
      } else if (target) {
        const shapes = addLink(project.shapes, from, target)
        if (shapes !== project.shapes) onCommit(shapes, [target.id])
        else onSelect([target.id])
      } else {
        if (tool === 'arrow') finishNodeLink(from)
        else {
          const c = center(from)
          const rightOrLeft = Math.abs(point.x - c.x) >= Math.abs(point.y - c.y)
          const side = moved ? rightOrLeft ? point.x > c.x ? 'right' : 'left' : point.y > c.y ? 'bottom' : 'top' : g.side!
          onExpand(moved ? point : position(from, side, 148), from, side)
        }
      }
    } else if (g.mode === 'pan') {
      setPan({ x: g.pan!.x + delta.x, y: g.pan!.y + delta.y })
    } else if (g.mode === 'draw') {
      const endTarget = g.item?.kind === 'arrow'
        ? document.elementsFromPoint(event.clientX, event.clientY).map(getTarget).find(item => item && isNode(item))
        : undefined
      if (g.item?.kind === 'pen' && g.points!.length < 6000) {
        const last = g.points!.at(-1)!
        if (Math.hypot(last.x - point.x, last.y - point.y) > 1.5) g.points!.push(point)
      }
      let created = draw(g, point, moved, endTarget)
      if (final) {
        if (g.item?.kind === 'arrow' && !moved && g.target) {
          const previous = project.shapes.find(item => item.id === pending)
          if (previous && previous.id !== g.target.id) {
            created = connector(previous, g.target)
            setPending(undefined)
          } else {
            setPending(previous ? undefined : g.target.id)
            created = undefined
          }
        }
        if (created) {
          onCommit([...project.shapes, created], [created.id])
          onFinishTool()
          if (created.kind === 'text') onEdit()
        }
      } else if (created && moved) {
        setPreview([...project.shapes, created])
      }
    } else if (g.mode === 'marquee' && moved) {
      const box = { x: Math.min(g.start.x, point.x), y: Math.min(g.start.y, point.y), width: Math.abs(g.start.x - point.x), height: Math.abs(g.start.y - point.y) }
      if (final) {
        const byId = new Map(project.shapes.map(item => [item.id, item]))
        const hit = project.shapes.filter(item => {
          const rect = bounds(item, byId)
          return !item.hidden && rect.x >= box.x && rect.y >= box.y && rect.x + rect.width <= box.x + box.width && rect.y + rect.height <= box.y + box.height
        })
        const groups = new Set(hit.flatMap(item => item.group ? [item.group] : []))
        const ids = project.shapes.filter(item => !item.hidden && (hit.includes(item) || item.group && groups.has(item.group))).map(item => item.id)
        onSelect([...new Set([...(g.add ? selected : []), ...ids])])
      } else setMarquee(box)
    } else if (g.mode !== 'marquee' && moved && g.ids?.length) {
      const shapes = transformed(g, point)
      if (final) {
        if (shapes.some((item, index) => item !== project.shapes[index])) onCommit(shapes)
      } else setPreview(shapes)
    }
    if (final) cancel()
  }

  function cancel() {
    gesture.current = null
    setGrabbing(false)
    setPreview(null)
    setMarquee(undefined)
    setLink(undefined)
  }

  function finishEditing(cancel = false) {
    if (!editing) return
    if (!cancel && editing.text !== editing.item.text) onText(editing.item.id, editing.text)
    setEditing(undefined)
  }

  return <div ref={view} className={'viewport tool-' + (space ? 'hand' : tool) + (grabbing ? ' grabbing' : '')}
    onPointerDown={start} onPointerMove={event => {
      const item = getTarget(event.target as Element)
      if (tool === 'arrow' && item && isNode(item)) setHoveredNode(item.id)
      else if (!(event.target as Element).closest('.node-port')) setHoveredNode(undefined)
      update(event, false)
    }}
    onPointerUp={event => update(event, true)} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onDoubleClick={event => {
      if (tool !== 'select') return
      const item = getTarget(document.elementFromPoint(event.clientX, event.clientY))
      if (!item) return
      if (isNode(item) || item.kind === 'text' || isLine(item)) setEditing({ item, text: item.text })
    }}>
    <div className="paper-position" style={{ width: paperWidth, height: paperHeight, left: size.x / 2 + pan.x, top: size.y / 2 + pan.y }}>
      <div className="paper-label"><span>画布</span><span>{project.width} × {project.height}</span></div>
      <Drawing ref={svgRef} project={preview ? { ...project, shapes: preview } : project} grid={grid}
        interactive selected={selected} pending={link?.target ?? pending}>
        {marquee && <rect {...marquee} stroke="#16845f" fill="#16845f1a" strokeDasharray="5 4" />}
        {link && <line x1={link.from.x} y1={link.from.y} x2={link.to.x} y2={link.to.y}
          stroke="#16845f" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none" />}
      </Drawing>
      {(activeNode || connectionNode) && !link && ports.map(port => {
        const node = connectionNode ?? activeNode!
        const location = position(node, port.side, 15 / scale)
        return <button key={port.side} className={'node-port port-' + port.side + (connectionNode ? ' connection-port' : '')} type="button"
          title={connectionNode ? '点击此连接点完成箭头，拖动创建预览' : '点击扩展节点，拖到其他节点连线'}
          aria-label={{ right: '向右连接点', bottom: '向下连接点', left: '向左连接点', top: '向上连接点' }[port.side]}
          style={{ left: location.x * scale, top: location.y * scale }}
          onPointerDown={event => {
            if (connectionNode && pending && connectionNode.id !== pending) {
              event.stopPropagation()
              event.preventDefault()
              finishNodeLink(connectionNode)
            } else beginLink(event, node, port.side)
          }}
          onClick={event => {
            if (!connectionNode && event.detail === 0) onExpand(position(node, port.side, 148), node, port.side)
          }}>{connectionNode ? <span className="port-dot" /> : <Plus size={13} />}</button>
      })}
      {editing && <textarea className="inline-editor" aria-label="在画布编辑文字" maxLength={800} ref={editor} value={editing.text}
        style={{ left: Math.max(4, Math.min(paperWidth - 136, center(editing.item).x * scale - 70)),
          top: Math.max(4, Math.min(paperHeight - 49, center(editing.item).y * scale - 22)),
          width: Math.max(130, Math.min(paperWidth - 8, editing.item.width * scale, 290)) }}
        onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
        onChange={event => setEditing({ ...editing, text: event.target.value })} onBlur={() => finishEditing()}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); finishEditing(true) }
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault(); finishEditing()
          }
        }} />}
      {project.shapes.length === 0 && !preview && tool === 'select' && <div className="canvas-empty">
        <Blocks size={28} /><strong>空白画布</strong><span>从左侧选择工具开始绘制</span>
        <button onClick={onTemplates}>浏览模板</button>
      </div>}
    </div>
    {tool === 'arrow' && <div className="canvas-tip">{pending ? '已选择起点，点击另一个节点作为终点' : '点击节点选择箭头起点，再点击终点'}</div>}
    {activeNode && !link && !pending && <div className="port-hint">点击 ＋ 扩展节点 · 拖动 ＋ 连线</div>}
  </div>
}
