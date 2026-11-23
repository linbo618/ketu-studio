import type { Shape } from './model'

export default function NodeGlyph({ item }: { item: Shape }) {
  const stroke = { stroke: item.stroke, strokeWidth: item.strokeWidth, vectorEffect: 'non-scaling-stroke' as const,
    strokeDasharray: item.dashed ? '7 5' : undefined, strokeLinejoin: 'round' as const }
  const props = { ...stroke, fill: item.fill, pointerEvents: 'all' as const }
  const paths: Partial<Record<NonNullable<Shape['symbol']>, string>> = {
    input: 'M 14 0 H 100 L 86 100 H 0 Z',
    document: 'M 0 0 H 100 V 82 C 74 63 73 112 0 95 Z',
    delay: 'M 0 0 H 58 A 42 50 0 0 1 58 100 H 0 Z',
    cloud: 'M 19 92 C -6 93 -5 48 13 45 C 12 19 31 11 40 22 C 49 -5 73 0 80 24 C 98 20 105 46 98 61 C 111 78 95 93 80 92 Z',
    note: 'M 0 0 H 77 L 100 24 V 100 H 0 Z',
    milestone: 'M 13 0 H 87 L 100 50 L 87 100 H 13 L 0 50 Z',
    database: 'M 0 16 C 0 -5 100 -5 100 16 V 84 C 100 105 0 105 0 84 Z',
    queue: 'M 12 0 H 88 C 104 0 104 100 88 100 H 12 C -4 100 -4 0 12 0 Z',
  }
  const accents: Partial<Record<NonNullable<Shape['symbol']>, string>> = {
    database: 'M 0 16 C 0 38 100 38 100 16',
    subprocess: 'M 11 1 V 99 M 89 1 V 99',
    component: 'M 0 24 H 13 V 42 H 0 M 0 57 H 13 V 75 H 0',
    queue: 'M 12 1 C 26 1 26 99 12 99 M 85 1 C 72 1 72 99 85 99',
    note: 'M 77 0 V 24 H 100',
    task: 'M 6 18 V 82',
    interface: 'M 9 0 V 100 M 91 0 V 100',
  }
  const symbol = item.symbol!
  return <svg x={item.x} y={item.y} width={item.width} height={item.height} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">
    {paths[symbol] ? <path d={paths[symbol]} {...props} /> :
      <rect x="0" y="0" width="100" height="100" rx={symbol === 'topic' || symbol === 'terminal' ? '23' : '6'} {...props} />}
    {accents[symbol] && <path d={accents[symbol]} {...stroke} fill="none" pointerEvents="none" />}
  </svg>
}
