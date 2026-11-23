import { forwardRef, useId } from 'react'
import { center, FONT_STACKS, isLine, lineEnds, type Diagram, type Shape } from './model'
import NodeGlyph from './NodeGlyph'

function routeLine(a: { x: number; y: number }, b: { x: number; y: number }, route: Shape['route']) {
  const horizontal = Math.abs(a.x - b.x) >= Math.abs(a.y - b.y)
  const label = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const p = horizontal ? { x: label.x, y: a.y } : { x: a.x, y: label.y }
  const q = horizontal ? { x: label.x, y: b.y } : { x: b.x, y: label.y }
  const position = (point: typeof a) => point.x + ' ' + point.y
  const move = 'M ' + position(a)
  const path = route === 'elbow' ? move + ' L ' + [p, q, b].map(position).join(' ')
    : route === 'curve' ? move + ' C ' + [p, q, b].map(position).join(' ')
      : move + ' L ' + position(b)
  return { path, label, angle: route && route !== 'straight' && (q.x !== b.x || q.y !== b.y)
    ? Math.atan2(b.y - q.y, b.x - q.x) : Math.atan2(b.y - a.y, b.x - a.x) }
}

function wrap(text: string, maxWidth: number, size: number) {
  const max = Math.max(1, maxWidth / size)
  return text.split('\n').flatMap(paragraph => {
    const lines: string[] = []
    let current = ''
    let units = 0
    for (const letter of paragraph) {
      const width = /[\u0000-\u00ff]/.test(letter) ? 0.58 : 1
      if (current && units + width > max) {
        lines.push(current.trimEnd())
        current = ''
        units = 0
      }
      current += letter
      units += width
    }
    lines.push(current)
    return lines
  })
}

function ShapeView({ item }: { item: Shape }) {
  const c = center(item)
  const style = {
    fill: item.fill, stroke: item.stroke, strokeWidth: item.strokeWidth,
    strokeDasharray: item.dashed ? '7 5' : undefined,
  }
  const lines = item.text ? wrap(item.text, Math.max(8, item.width * (item.kind === 'diamond' ? .61 : 1) - 16), item.fontSize) : []
  const lineHeight = item.fontSize * 1.25
  const labelX = item.align === 'left' ? item.x + 8 : item.align === 'right' ? item.x + item.width - 8 : c.x
  return <g transform={'rotate(' + item.rotation + ' ' + c.x + ' ' + c.y + ')'}>
    {item.kind === 'rect' && item.symbol && <NodeGlyph item={item} />}
    {((item.kind === 'rect' && !item.symbol) || item.kind === 'text') && <rect x={item.x} y={item.y} width={item.width} height={item.height} rx={Math.min(item.radius, item.width / 2, item.height / 2)} {...style} stroke={item.kind === 'text' && item.fill === 'none' ? 'none' : item.stroke} pointerEvents="all" />}
    {item.kind === 'ellipse' && <ellipse cx={c.x} cy={c.y} rx={item.width / 2} ry={item.height / 2} {...style} pointerEvents="all" />}
    {item.kind === 'diamond' && <polygon points={[[c.x, item.y], [item.x + item.width, c.y], [c.x, item.y + item.height], [item.x, c.y]].map(point => point.join(',')).join(' ')} {...style} strokeLinejoin="round" pointerEvents="all" />}
    {item.kind === 'pen' && <polyline fill="none" stroke={item.stroke} strokeWidth={item.strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={style.strokeDasharray} points={item.points?.map(point => [item.x + point.x * item.width, item.y + point.y * item.height].join(',')).join(' ')} />}
    {lines.length > 0 && <text
      x={labelX} y={c.y - (lines.length - 1) * lineHeight / 2} dominantBaseline="central"
      textAnchor={item.align === 'left' ? 'start' : item.align === 'right' ? 'end' : 'middle'}
      fontSize={item.fontSize} fill={item.color} fontFamily={FONT_STACKS[item.font]}
      fontWeight={item.bold ? 700 : 500} pointerEvents="none"
    >{lines.map((line, index) => <tspan key={index} x={labelX} dy={index ? lineHeight : 0}>{line || '\u00a0'}</tspan>)}</text>}
  </g>
}

interface Props {
  project: Diagram
  grid?: boolean
  interactive?: boolean
  selected?: string[]
  pending?: string
  decorative?: boolean
  children?: React.ReactNode
}

export const Drawing = forwardRef<SVGSVGElement, Props>(function Drawing(
  { project, grid, interactive, selected = [], pending, children, decorative }, ref,
) {
  const pattern = 'grid' + useId().replace(/[^a-z0-9]/gi, '')
  const byId = new Map(project.shapes.map(item => [item.id, item]))
  const visible = project.shapes.filter(item => !item.hidden &&
    !byId.get(item.from ?? '')?.hidden && !byId.get(item.to ?? '')?.hidden)
  return <svg ref={ref} className={interactive ? 'drawing' : 'thumbnail-drawing'} xmlns="http://www.w3.org/2000/svg"
    viewBox={'0 0 ' + project.width + ' ' + project.height} width={project.width} height={project.height}
    role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : project.name} data-diagram={interactive ? 'active' : undefined}>
    <rect width={project.width} height={project.height} fill={project.background} />
    {grid && <g data-editor-only="true" pointerEvents="none">
      <defs><pattern id={pattern} width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="0.85" fill="#7e9c8a" opacity=".34" /></pattern></defs>
      <rect width={project.width} height={project.height} fill={'url(#' + pattern + ')'} />
    </g>}
    <g data-artwork="true">
      {visible.map(item => {
        const attributes = {
          'data-shape': interactive ? item.id : undefined,
          'data-kind': interactive ? item.kind : undefined,
          'data-label': interactive ? item.text || undefined : undefined,
        }
        if (!isLine(item)) return <g key={item.id} {...attributes}><ShapeView item={item} /></g>
        const [a, b] = lineEnds(item, byId)
        const { path, angle, label } = routeLine(a, b, item.route)
        const size = Math.max(8, item.strokeWidth * 3)
        const arrow = [[b.x, b.y], ...[-.47, .47].map(offset => [
          b.x - size * Math.cos(angle + offset), b.y - size * Math.sin(angle + offset),
        ])].map(point => point.join(',')).join(' ')
        return <g key={item.id} {...attributes}>
          {interactive && <path d={path} fill="none" stroke="transparent" strokeWidth="18" data-editor-only="true" />}
          {item.route && item.route !== 'straight'
            ? <path d={path} fill="none" stroke={item.stroke} strokeWidth={item.strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={item.dashed ? '7 5' : undefined} />
            : <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={item.stroke} strokeWidth={item.strokeWidth} strokeLinecap="round" strokeDasharray={item.dashed ? '7 5' : undefined} />}
          {item.kind === 'arrow' && <polygon points={arrow} fill={item.stroke} />}
          {item.text && <text x={label.x} y={label.y} dominantBaseline="central" textAnchor="middle" fontSize={item.fontSize}
            fontFamily={FONT_STACKS[item.font]} fill={item.color} stroke={project.background} strokeWidth="6" paintOrder="stroke" strokeLinejoin="round">{item.text}</text>}
        </g>
      })}
    </g>
    {interactive && <g data-editor-only="true">
      {visible.filter(item => selected.includes(item.id) || item.id === pending).map(item => {
        if (isLine(item)) {
          const [a, b] = lineEnds(item, byId)
          return <path key={item.id} d={routeLine(a, b, item.route).path} fill="none" stroke="#12895d" strokeWidth="1.5" strokeDasharray="4 4" pointerEvents="none" />
        }
        const c = center(item)
        const handle = selected.length === 1 && item.id !== pending
        const x2 = item.x + item.width
        const y2 = item.y + item.height
        return <g key={item.id} transform={'rotate(' + item.rotation + ' ' + c.x + ' ' + c.y + ')'}>
          <rect x={item.x - 3} y={item.y - 3} width={item.width + 6} height={item.height + 6} fill="none" stroke="#16845f" strokeWidth="1.5" strokeDasharray={item.id === pending ? '5 3' : undefined} pointerEvents="none" />
          {handle && <>
            <line x1={c.x} y1={item.y - 4} x2={c.x} y2={item.y - 26} stroke="#16845f" pointerEvents="none" />
            <circle cx={c.x} cy={item.y - 27} r="6" className="rotate-handle" data-handle="rotate" data-shape={item.id} fill="white" stroke="#16845f" strokeWidth="1.7" />
            <rect x={x2 - 4} y={y2 - 4} width="12" height="12" rx="2" className="resize-handle" data-handle="resize" data-shape={item.id} fill="white" stroke="#16845f" strokeWidth="1.7" />
          </>}
        </g>
      })}
      {children}
    </g>}
  </svg>
})
