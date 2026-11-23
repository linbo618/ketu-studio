import type { Shape } from './model'

export const symbolGroups = ['流程图', '系统架构', '思维与计划'] as const

export const symbols = [
  { id: 'process', label: '处理步骤', kind: 'rect', group: 0, fill: '#e4f4eb', size: [148, 64] },
  { id: 'terminal', label: '开始 / 结束', kind: 'rect', group: 0, fill: '#195a46', size: [130, 56] },
  { id: 'decision', label: '条件判断', kind: 'diamond', group: 0, fill: '#fff0cf', size: [156, 102] },
  { id: 'input', label: '输入 / 输出', kind: 'rect', group: 0, fill: '#e2f1fc', size: [154, 62] },
  { id: 'document', label: '文档', kind: 'rect', group: 0, fill: '#fff4df', size: [142, 72] },
  { id: 'subprocess', label: '子流程', kind: 'rect', group: 0, fill: '#eee8fa', size: [146, 64] },
  { id: 'delay', label: '等待', kind: 'rect', group: 0, fill: '#fce8df', size: [132, 59] },
  { id: 'database', label: '数据库', kind: 'rect', group: 1, fill: '#e2f1fc', size: [132, 76] },
  { id: 'cloud', label: '云服务', kind: 'rect', group: 1, fill: '#ede9fb', size: [152, 84] },
  { id: 'actor', label: '角色', kind: 'ellipse', group: 1, fill: '#f7ebfa', size: [130, 70] },
  { id: 'component', label: '组件', kind: 'rect', group: 1, fill: '#e3f0fa', size: [146, 66] },
  { id: 'queue', label: '消息队列', kind: 'rect', group: 1, fill: '#fff2d5', size: [141, 64] },
  { id: 'interface', label: '接口', kind: 'rect', group: 1, fill: '#dcf2ef', size: [126, 59] },
  { id: 'concept', label: '主题概念', kind: 'ellipse', group: 2, fill: '#e4f4eb', size: [147, 72] },
  { id: 'note', label: '便签', kind: 'rect', group: 2, fill: '#fff3cc', size: [139, 72] },
  { id: 'milestone', label: '里程碑', kind: 'rect', group: 2, fill: '#fbe3e2', size: [144, 64] },
  { id: 'task', label: '任务卡', kind: 'rect', group: 2, fill: '#e1f0eb', size: [147, 65] },
  { id: 'topic', label: '分支主题', kind: 'rect', group: 2, fill: '#eee8fa', size: [145, 60] },
] as const

export type SymbolId = typeof symbols[number]['id']
export function findSymbol(id: unknown) {
  return symbols.find(symbol => symbol.id === id)
}

export function symbolLabel(item: Shape) {
  return findSymbol(item.symbol)?.label
}
