import { bounds, center, clamp, connector, fitGrid, isNode, MAX_PAGE, shape, type Diagram, type Point, type Shape } from './model'
import { findSymbol, type SymbolId } from './symbols'

export type Side = 'right' | 'bottom' | 'left' | 'top'

export function makeNode(symbolId: SymbolId, text?: string): Shape {
  const symbol = findSymbol(symbolId)!
  const terminal = symbol.id === 'terminal'
  const label = text ?? symbol.label
  const width = Math.max(symbol.size[0], Math.min(270, [...label].length * 12 + 38))
  return shape(symbol.kind, 0, 0, {
    symbol: symbol.id, width, height: symbol.size[1] + Math.max(0, Math.min(3, Math.floor([...label].length / 22) - 1)) * 18,
    text: label, bold: true, fill: symbol.fill, stroke: terminal ? '#195a46' : '#7fa593',
    color: terminal ? '#ffffff' : '#21483b', radius: terminal || symbol.id === 'topic' ? 32 : 10,
  })
}

export function addLink(shapes: Shape[], from: Shape, to: Shape, options: Partial<Shape> = {}) {
  if (from.id === to.id || shapes.some(item => item.from === from.id && item.to === to.id)) return shapes
  const edge = connector(from, to, { route: 'elbow', ...options })
  const firstNode = shapes.findIndex(isNode)
  if (firstNode === -1) return [...shapes, edge]
  return [...shapes.slice(0, firstNode), edge, ...shapes.slice(firstNode)]
}

export function nearestNode(project: Diagram, point: Point, exclude: string, tolerance: number) {
  let winner: Shape | undefined
  let distance = tolerance
  const byId = new Map(project.shapes.map(item => [item.id, item]))
  for (const item of [...project.shapes].reverse()) {
    if (item.hidden || !isNode(item) || item.id === exclude) continue
    const box = bounds(item, byId)
    const gap = Math.hypot(point.x - clamp(point.x, box.x, box.x + box.width), point.y - clamp(point.y, box.y, box.y + box.height))
    if (gap >= distance) continue
    distance = gap
    winner = item
  }
  return winner
}

export function growPage(project: Diagram, shapes: Shape[]) {
  const byId = new Map(shapes.map(item => [item.id, item]))
  const boxes = shapes.filter(item => !item.hidden).map(item => bounds(item, byId))
  if (!boxes.length) return { shapes, width: project.width, height: project.height }
  const left = Math.min(...boxes.map(box => box.x))
  const top = Math.min(...boxes.map(box => box.y))
  const dx = left < 0 ? Math.ceil((36 - left) / 16) * 16 : 0
  const dy = top < 0 ? Math.ceil((36 - top) / 16) * 16 : 0
  const right = Math.max(...boxes.map(box => box.x + box.width)) + dx
  const bottom = Math.max(...boxes.map(box => box.y + box.height)) + dy
  return {
    shapes: dx || dy ? shapes.map(item => ({ ...item, x: item.x + dx, y: item.y + dy })) : shapes,
    width: Math.min(MAX_PAGE.width, Math.max(project.width + dx, Math.ceil((right + (right > project.width ? 48 : 0)) / 16) * 16)),
    height: Math.min(MAX_PAGE.height, Math.max(project.height + dy, Math.ceil((bottom + (bottom > project.height ? 48 : 0)) / 16) * 16)),
  }
}

export function placeNode(project: Diagram, node: Shape, point: Point, anchor?: { node: Shape; side: Side }, snap = true) {
  const byId = new Map(project.shapes.map(item => [item.id, item]))
  const boxes = project.shapes.filter(item => !item.hidden && (isNode(item) || item.kind === 'text')).map(item => bounds(item, byId))
  const overlaps = (candidate: Shape) => boxes.some(box => candidate.x < box.x + box.width + 15 && candidate.x + candidate.width + 15 > box.x &&
    candidate.y < box.y + box.height + 15 && candidate.y + candidate.height + 15 > box.y)
  const horizontal = !anchor || anchor.side === 'right' || anchor.side === 'left'
  const c = anchor ? center(anchor.node) : point
  const box = anchor ? bounds(anchor.node, byId) : undefined
  const base = { x: point.x - node.width / 2, y: point.y - node.height / 2 }
  if (anchor && box) {
    if (anchor.side === 'right') base.x = Math.max(base.x, box.x + box.width + 64)
    if (anchor.side === 'left') base.x = Math.min(base.x, box.x - node.width - 64)
    if (anchor.side === 'bottom') base.y = Math.max(base.y, box.y + box.height + 64)
    if (anchor.side === 'top') base.y = Math.min(base.y, box.y - node.height - 64)
    if (horizontal && Math.abs(point.y - c.y) < 20) base.y = c.y - node.height / 2
    if (!horizontal && Math.abs(point.x - c.x) < 20) base.x = c.x - node.width / 2
  }
  const attempts = 27
  let candidate = node
  for (let i = 0; i < attempts; i++) {
    const displacement = Math.ceil(i / 2) * (i % 2 ? 1 : -1) * (horizontal ? node.height + 36 : node.width + 42)
    candidate = { ...node,
      x: fitGrid(base.x + (horizontal ? 0 : displacement), snap),
      y: fitGrid(base.y + (horizontal ? displacement : 0), snap),
    }
    if (!overlaps(candidate)) return candidate
  }
  return { ...candidate, x: Math.max(...boxes.map(box => box.x + box.width), project.width) + 64, y: Math.max(24, base.y) }
}

export function autoLink(project: Diagram, selection: string[], direction: 'horizontal' | 'vertical') {
  const horizontal = direction === 'horizontal'
  const nodes = project.shapes.filter(item => isNode(item) && !item.hidden && (selection.length === 0 || selection.includes(item.id)))
    .sort((a, b) => horizontal ? center(a).x - center(b).x || a.y - b.y : center(a).y - center(b).y || a.x - b.x)
  return nodes.slice(1).reduce((shapes, item, index) => addLink(shapes, nodes[index], item), project.shapes)
}

export function appendBranch(project: Diagram, draft: Diagram, anchor: Shape) {
  const nodes = draft.shapes.filter(isNode)
  const edges = draft.shapes.filter(item => item.from && item.to)
  if (!nodes.length) throw new Error('生成草稿没有可以接入的节点。')
  const existing = new Map(project.shapes.map(item => [item.id, item]))
  const occupied = project.shapes.filter(item => !item.hidden).map(item => bounds(item, existing))
  const left = Math.min(...nodes.map(item => item.x))
  const top = Math.min(...nodes.map(item => item.y))
  const width = Math.max(...nodes.map(item => item.x + item.width)) - left
  const height = Math.max(...nodes.map(item => item.y + item.height)) - top
  const x = Math.max(...occupied.map(item => item.x + item.width), anchor.x + anchor.width) + 96
  const y = Math.max(...occupied.map(item => item.y + item.height), anchor.y + anchor.height) + 96
  const rightFits = x + width + 48 <= MAX_PAGE.width && Math.max(36, anchor.y) + height + 48 <= MAX_PAGE.height
  const bottomFits = y + height + 48 <= MAX_PAGE.height && Math.max(36, anchor.x) + width + 48 <= MAX_PAGE.width
  if (!rightFits && !bottomFits) throw new Error('当前画布没有足够空间接入该图，可以另存为新项目。')
  const dx = (rightFits ? x : Math.max(36, anchor.x)) - left
  const dy = (rightFits ? Math.max(36, anchor.y) : y) - top
  const placed = nodes.map(item => ({ ...item, x: item.x + dx, y: item.y + dy }))
  const incoming = new Set(edges.map(item => item.to))
  const roots = placed.filter(item => !incoming.has(item.id))
  const entries = roots.length ? roots : placed.slice(0, 1)
  let shapes = [...project.shapes, ...edges.map(item => ({ ...item, x: item.x + dx, y: item.y + dy })), ...placed]
  for (const item of entries) shapes = addLink(shapes, anchor, item)
  return { changes: growPage(project, shapes), selected: placed.map(item => item.id) }
}
