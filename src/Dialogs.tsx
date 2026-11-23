import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, FileImage, FileJson, PencilRuler, Sparkles, X } from 'lucide-react'
import { Drawing } from './Drawing'
import { templates } from './templates'
import { fromAI, fromOutline } from './generate'
import type { Diagram, Direction } from './model'

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
  return <Modal title="从模板开始" description="选择一个场景，创建可编辑的副本。" onClose={onClose} wide>
    <div className="template-gallery">{templates.map((item, index) => <button key={item.id} className="template-card" onClick={() => onCreate(item.create())}>
      <div className={'template-preview ' + item.tone}><Drawing project={previews[index]} /></div>
      <div><strong>{item.name}</strong><span>{item.detail}</span></div>
    </button>)}</div>
  </Modal>
}

const sample = '标题：课程作业提交\n准备作业材料\n核对格式要求\n上传到课程平台\n确认提交成功'

export function GenerateDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (project: Diagram) => void }) {
  const [description, setDescription] = useState('')
  const [direction, setDirection] = useState<Direction>('horizontal')
  const [mode, setMode] = useState<'local' | 'ai'>('local')
  const [endpoint, setEndpoint] = useState('')
  const [model, setModel] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  useEffect(() => () => { active.current = false }, [])

  async function generate() {
    if (!description.trim()) { setError('请输入步骤或简要描述。'); return }
    setBusy(true)
    setError('')
    try {
      const result = mode === 'ai'
        ? await fromAI(description, direction, { endpoint, model, key })
        : fromOutline(description, direction)
      if (active.current) onCreate(result)
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : '生成失败')
    } finally {
      if (active.current) setBusy(false)
    }
  }

  return <Modal title="文字生成流程图" description="把课程步骤变成可编辑的图形和箭头。" onClose={onClose}>
    <form className="dialog-form" onSubmit={event => { event.preventDefault(); void generate() }}>
      <div className="segmented">
        <button type="button" className={mode === 'local' ? 'current' : ''} onClick={() => setMode('local')}><PencilRuler size={15} />按步骤生成</button>
        <button type="button" className={mode === 'ai' ? 'current' : ''} onClick={() => setMode('ai')}><Sparkles size={15} />连接 AI 模型</button>
      </div>
      <div><div className="label-row"><label htmlFor="outline">流程描述</label><button type="button" className="text-button" onClick={() => setDescription(sample)}>填入示例</button></div>
        <textarea id="outline" rows={5} maxLength={3000} placeholder={sample} value={description} onChange={event => setDescription(event.target.value)} />
      </div>
      {mode === 'ai' && <div className="ai-fields">
        <label>接口地址<input type="url" required value={endpoint} placeholder="https://…/v1/chat/completions" onChange={event => setEndpoint(event.target.value)} /></label>
        <label>模型名称<input required value={model} placeholder="服务商提供的模型 ID" onChange={event => setModel(event.target.value)} /></label>
        <label>API 密钥<input type="password" autoComplete="off" value={key} placeholder="本次生成使用" onChange={event => setKey(event.target.value)} /></label>
        <p>描述会发送到所填服务。关闭窗口后清除密钥。</p>
      </div>}
      <label className="dialog-label">布局方向<span className="select-wrap"><select value={direction} onChange={event => setDirection(event.target.value as Direction)}>
        <option value="horizontal">从左到右</option><option value="vertical">从上到下</option>
      </select><ChevronDown size={14} /></span></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-footer"><button type="button" className="outlined" onClick={onClose}>取消</button><button className="primary" disabled={busy} type="submit"><Sparkles size={16} />{busy ? '正在生成…' : '生成新项目'}</button></div>
    </form>
  </Modal>
}

export function ExportDialog({ onClose, onExport, onSave }: {
  onClose: () => void; onExport: (format: 'png' | 'svg', transparent: boolean, scale: number) => Promise<void>; onSave: () => void
}) {
  const [format, setFormat] = useState<'png' | 'svg'>('png')
  const [transparent, setTransparent] = useState(false)
  const [scale, setScale] = useState(2)
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
        <option value={1}>1× 原始大小</option><option value={2}>2× 高清</option>
      </select><ChevronDown size={14} /></span></label>}
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
