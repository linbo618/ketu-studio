import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, FileImage, FileJson, X } from 'lucide-react'
import { Drawing } from './Drawing'
import { templates } from './templates'
import { diagramFamilies } from './generate'
import type { Diagram } from './model'

export function Modal({ title, description, onClose, children, wide }: {
  title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} aria-label={title} className={wide ? 'dialog wide' : 'dialog'}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog-inner">
      <div className="dialog-header">
        <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
        <button className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button>
      </div>
      {children}
    </div>
  </dialog>
}

const previews = templates.map(template => template.create())

export function TemplatesDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (project: Diagram) => void }) {
  const [category, setCategory] = useState('全部')
  return <Modal title="从模板开始" description="12 个场景模板，每个图形和连线都可编辑。" onClose={onClose} wide>
    <div className="filter-row">{['全部', ...diagramFamilies].map(name => <button key={name} className={'outlined' + (category === name ? ' active' : '')}
      aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
    <div className="template-gallery">{templates.map((item, index) => (category === '全部' || category === item.category) && <button key={item.id} className="template-card" onClick={() => onCreate(item.create())}>
      <div className={'template-preview ' + item.tone}><Drawing project={previews[index]} decorative /></div>
      <div><strong>{item.name}</strong><span>{item.detail}</span></div>
    </button>)}</div>
  </Modal>
}

export function ExportDialog({ onClose, onExport, onSave, canDouble }: {
  onClose: () => void; onExport: (format: 'png' | 'svg', transparent: boolean, scale: number) => Promise<void>; onSave: () => void; canDouble: boolean
}) {
  const [format, setFormat] = useState<'png' | 'svg'>('png')
  const [transparent, setTransparent] = useState(false)
  const [scale, setScale] = useState(canDouble ? 2 : 1)
  const [busy, setBusy] = useState(false)
  return <Modal title="导出示意图" description="将图形用于报告、作业或答辩幻灯片。" onClose={onClose}>
    <form className="dialog-form" onSubmit={async event => {
      event.preventDefault()
      setBusy(true)
      try { await onExport(format, transparent, scale) } finally { setBusy(false) }
    }}>
      <div className="format-grid">
        {(['png', 'svg'] as const).map(choice => <button type="button" key={choice} className={'format-option' + (format === choice ? ' current' : '')}
          onClick={() => setFormat(choice)} aria-pressed={format === choice}>
          <FileImage size={20} /><span><strong>{choice.toUpperCase()}</strong><small>{choice === 'png' ? '位图 · 文档和 PPT' : '矢量 · 任意缩放'}</small></span>{format === choice && <Check size={16} />}
        </button>)}
      </div>
      {format === 'png' && <label className="dialog-label">分辨率<span className="select-wrap"><select value={scale} onChange={event => setScale(Number(event.target.value))}>
        <option value={1}>1× 原始大小</option><option value={2} disabled={!canDouble}>2× 高清</option>
      </select><ChevronDown size={14} /></span></label>}
      {format === 'png' && !canDouble && <p className="field-note">大画布可以导出 1× PNG 或任意缩放的 SVG。</p>}
      <label className="check-field"><input type="checkbox" checked={transparent} onChange={event => setTransparent(event.target.checked)} />透明背景</label>
      <div className="dialog-footer split">
        <button type="button" className="text-button" onClick={onSave}><FileJson size={16} />下载项目文件</button>
        <button type="submit" className="primary" disabled={busy}>{busy ? '正在导出…' : '下载 ' + format.toUpperCase()}</button>
      </div>
    </form>
  </Modal>
}

export function ShortcutDialog({ onClose }: { onClose: () => void }) {
  return <Modal title="键盘快捷键" onClose={onClose}>
    <div className="shortcuts">{[
      ['选择 / 平移', 'V / H'], ['矩形 / 椭圆 / 菱形', 'R / O / D'], ['直线 / 箭头 / 画笔 / 文本', 'L / A / P / T'],
      ['临时平移画布', '空格 + 拖动'], ['多选', 'Shift + 点击 / 框选'], ['全选', 'Ctrl / ⌘ + A'],
      ['移动所选', '方向键'], ['组合 / 取消组合', 'Ctrl / ⌘ + G / Shift + G'],
      ['复制 / 粘贴 / 快速复制', 'Ctrl / ⌘ + C / V / D'], ['撤销 / 重做', 'Ctrl / ⌘ + Z / Shift + Z'],
      ['保存到浏览器', 'Ctrl / ⌘ + S'], ['删除对象', 'Delete'],
    ].map(([title, key]) => <div key={title}><span>{title}</span><kbd>{key}</kbd></div>)}</div>
  </Modal>
}
