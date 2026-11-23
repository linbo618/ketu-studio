import { Search } from 'lucide-react'
import { useState } from 'react'
import { Modal } from './Dialogs'
import { Drawing } from './Drawing'
import { makeNode } from './graphEdit'
import { diagram } from './model'
import { symbolGroups, symbols, type SymbolId } from './symbols'

const previews = new Map(symbols.map(symbol => {
  const node = { ...makeNode(symbol.id, ''), x: 10, y: 8 }
  return [symbol.id, { ...diagram(symbol.label, [node]), width: node.width + 20, height: node.height + 16 }]
}))

export function SymbolPicker({ onClose, onPick, linked }: { onClose: () => void; onPick: (id: SymbolId) => void; linked: boolean }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(-1)
  const filtered = symbols.filter(item => (category === -1 || item.group === category) &&
    (item.label.includes(query.trim()) || item.id.includes(query.trim().toLowerCase())))
  return <Modal title={linked ? '扩展并自动连线' : '添加图形'} description={linked ? '选择要添加的节点，箭头会自动连接。' : '选择流程、架构或计划图形。'} onClose={onClose} wide>
    <label className="library-search"><Search size={16} /><input autoFocus aria-label="搜索图形" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索数据库、文档、条件判断…" /></label>
    <div className="filter-row">{['全部图形', ...symbolGroups].map((name, index) => <button key={name}
      className={'outlined' + (category === index - 1 ? ' active' : '')} aria-pressed={category === index - 1} onClick={() => setCategory(index - 1)}>{name}</button>)}</div>
    <div className="symbol-grid">{filtered.map(item => <button key={item.id} className="symbol-card" onClick={() => onPick(item.id)}>
      <Drawing project={previews.get(item.id)!} decorative /><span>{item.label}</span>
    </button>)}</div>
    {filtered.length === 0 && <p className="muted">没有匹配的图形。</p>}
  </Modal>
}
