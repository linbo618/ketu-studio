import { ArrowDownToLine, ArrowUpToLine, ChevronDown, Circle, Copy, Eye, EyeOff, Group, Layers3, RotateCcw, SlidersHorizontal, Square, Trash2, Ungroup, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { clamp, COLORS, isLine, KIND_NAMES, MAX_PAGE, round, type Diagram, type Shape } from './model'
import { symbolLabel } from './symbols'

function Section({ title, children, end }: { title: string; children: ReactNode; end?: ReactNode }) {
  return <section className="property-section"><div className="section-heading"><h3>{title}</h3>{end}</div>{children}</section>
}

function NumberField({ label, value, onChange, min, max, suffix }: {
  label: string; value: number; onChange: (value: number) => void; min: number; max: number; suffix?: string
}) {
  const [draft, setDraft] = useState(String(round(value)))
  useEffect(() => { setDraft(String(round(value))) }, [value])
  return <label className="number-field"><span>{label}</span><input type="number" step="any" min={min} max={max}
    value={draft} onChange={event => setDraft(event.target.value)}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
    onBlur={() => {
      const parsed = draft.trim() ? Number(draft) : NaN
      if (Number.isFinite(parsed)) {
        const next = round(clamp(parsed, min, max))
        setDraft(String(next))
        if (value !== next) onChange(next)
      } else setDraft(String(round(value)))
    }} />{suffix && <small>{suffix}</small>}</label>
}

function ColorField({ label, value, onChange, palettes = false, transparent = false }: {
  label: string; value: string; onChange: (color: string) => void; palettes?: boolean; transparent?: boolean
}) {
  return <div className="color-selector">
    <label className="color-field"><span>{label}</span><span className="color-value">
      <input type="color" value={value === 'none' ? '#ffffff' : value} onChange={event => onChange(event.target.value)} />
      <span>{value === 'none' ? '透明' : value.toUpperCase()}</span>
    </span></label>
    {palettes && <div className="swatches">
      {(transparent ? [...COLORS, 'none'] : COLORS).map(color => <button key={color} type="button"
        className={'swatch' + (color === value ? ' active' : '') + (color === 'none' ? ' transparent' : '')}
        aria-label={label + ' ' + (color === 'none' ? '透明' : color)} title={color === 'none' ? '透明' : color}
        onClick={() => onChange(color)} style={{ backgroundColor: color === 'none' ? undefined : color }} />)}
    </div>}
  </div>
}

function TextField({ value, onCommit }: { value: string; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return <textarea className="text-edit" aria-label="文字内容" data-text-edit rows={2} value={draft} maxLength={800}
    onChange={event => setDraft(event.target.value)} onBlur={() => { if (draft !== value) onCommit(draft) }}
    onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') event.currentTarget.blur() }} />
}

interface Props {
  project: Diagram
  selected: string[]
  tab: 'properties' | 'layers'
  onTab: (tab: 'properties' | 'layers') => void
  onSelect: (ids: string[]) => void
  onShape: (id: string, change: Partial<Shape>) => void
  onProject: (change: Partial<Diagram>) => void
  onDelete: () => void
  onDuplicate: () => void
  onGroup: (ungroup: boolean) => void
  onLayer: (direction: 'up' | 'down') => void
  onAlign: (axis: 'left' | 'center' | 'top' | 'middle') => void
  onClose: () => void
  mobileOpen: boolean
}

export default function Inspector({ project, selected, tab, onTab, onSelect, onShape, onProject, onDelete, onDuplicate, onGroup, onLayer, onAlign, onClose, mobileOpen }: Props) {
  const objects = project.shapes.filter(item => selected.includes(item.id))
  const item = objects.length === 1 ? objects[0] : undefined
  const line = item ? isLine(item) : false
  const text = item && (item.kind === 'text' || ['rect', 'ellipse', 'diamond'].includes(item.kind))
  const update = (change: Partial<Shape>) => { if (item) onShape(item.id, change) }
  const groupSelected = objects.some(item => item.group)

  function layerSelection(layer: Shape, add: boolean) {
    const ids = layer.group ? project.shapes.filter(item => item.group === layer.group).map(item => item.id) : [layer.id]
    onSelect(add ? selected.includes(layer.id) ? selected.filter(id => !ids.includes(id)) : [...new Set([...selected, ...ids])] : ids)
  }

  return <aside className={'inspector' + (mobileOpen ? ' mobile-open' : '')} aria-label="属性与图层">
    <div className="inspector-tabs">
      <button className={tab === 'properties' ? 'current' : ''} onClick={() => onTab('properties')}><SlidersHorizontal size={15} />属性</button>
      <button className={tab === 'layers' ? 'current' : ''} onClick={() => onTab('layers')}><Layers3 size={15} />图层</button>
      <button className="icon-button panel-close" title="收起属性" onClick={onClose}><X size={17} /></button>
    </div>
    <div className="inspector-scroll">
      {tab === 'layers' ? <>
        <Section title="对象顺序" end={<span className="muted count">{project.shapes.length} 个</span>}>
          <div className="layer-list">{[...project.shapes].reverse().map(layer => <div key={layer.id} className={'layer-row' + (selected.includes(layer.id) ? ' selected' : '')}>
            <button type="button" className="layer-name" onClick={event => layerSelection(layer, event.shiftKey)} title={layer.text || KIND_NAMES[layer.kind]}>
              {layer.kind === 'ellipse' ? <Circle size={14} /> : <Square size={14} />}
              <span>{layer.text || KIND_NAMES[layer.kind]}</span>
              {layer.group && <Group size={13} />}
            </button>
            <button type="button" className="icon-button visibility" title={layer.hidden ? '显示图层' : '隐藏图层'} onClick={() => onShape(layer.id, { hidden: !layer.hidden })}>
              {layer.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>)}</div>
          {project.shapes.length === 0 && <p className="muted">画布中的对象会显示在这里。</p>}
        </Section>
      </> : item ? <>
        <div className="object-heading">
          <div className="object-icon">{item.kind === 'ellipse' ? <Circle size={19} /> : <Square size={19} />}</div>
          <div><strong>{item.text?.split('\n')[0] || symbolLabel(item) || KIND_NAMES[item.kind]}</strong><span>{symbolLabel(item) ?? KIND_NAMES[item.kind]}</span></div>
        </div>
        <Section title="位置与尺寸" end={<button className="icon-button small" title="重置旋转" disabled={item.rotation === 0} onClick={() => update({ rotation: 0 })}><RotateCcw size={14} /></button>}>
          <div className="field-grid">
            <NumberField label="X" value={item.x} min={-12000} max={12000} onChange={x => update({ x })} />
            <NumberField label="Y" value={item.y} min={-12000} max={12000} onChange={y => update({ y })} />
            <NumberField label="宽" value={item.width} min={line ? -12000 : 1} max={12000} onChange={width => update({ width })} />
            <NumberField label="高" value={item.height} min={line ? -12000 : 1} max={12000} onChange={height => update({ height })} />
            <NumberField label="旋转" suffix="°" value={item.rotation} min={-360} max={360} onChange={rotation => update({ rotation })} />
            {item.kind === 'rect' && <NumberField label="圆角" value={item.radius} min={0} max={300} onChange={radius => update({ radius })} />}
          </div>
          {line && (item.from || item.to) && <p className="field-note">箭头端点随已连接的图形移动。</p>}
        </Section>
        {line && <Section title="连线">
          <label className="select-wrap"><select aria-label="连线样式" value={item.route ?? 'straight'} onChange={event => update({ route: event.target.value as Shape['route'] })}>
            <option value="straight">直线</option><option value="elbow">直角折线</option><option value="curve">曲线</option>
          </select><ChevronDown size={13} /></label>
          <TextField key={item.id} value={item.text} onCommit={text => update({ text })} />
        </Section>}
        <Section title="外观">
          {!line && item.kind !== 'pen' && <ColorField label="填充" value={item.fill} onChange={fill => update({ fill })} palettes transparent />}
          {(item.kind !== 'text' || item.fill !== 'none') && <ColorField label={line || item.kind === 'pen' ? '线条' : '描边'} value={item.stroke} onChange={stroke => update({ stroke })} />}
          {item.kind !== 'text' && <div className="field-grid">
            <NumberField label="线宽" value={item.strokeWidth} min={0} max={32} onChange={strokeWidth => update({ strokeWidth })} />
            <button className={'outlined toggle-field' + (item.dashed ? ' active' : '')} aria-pressed={item.dashed} onClick={() => update({ dashed: !item.dashed })}>虚线</button>
          </div>}
        </Section>
        {text && <Section title="文字">
          <TextField key={item.id} value={item.text} onCommit={text => update({ text })} />
          <div className="field-grid">
            <NumberField label="字号" value={item.fontSize} min={8} max={160} onChange={fontSize => update({ fontSize })} />
            <label className="select-wrap"><select aria-label="字体" value={item.font} onChange={event => update({ font: event.target.value as Shape['font'] })}>
              <option value="sans">无衬线</option><option value="serif">衬线</option><option value="mono">等宽</option>
            </select><ChevronDown size={13} /></label>
            <label className="select-wrap"><select aria-label="文字对齐" value={item.align} onChange={event => update({ align: event.target.value as Shape['align'] })}>
              <option value="left">靠左</option><option value="center">居中</option><option value="right">靠右</option>
            </select><ChevronDown size={13} /></label>
            <button className={'outlined toggle-field' + (item.bold ? ' active' : '')} aria-pressed={item.bold} onClick={() => update({ bold: !item.bold })}>加粗</button>
          </div>
          <ColorField label="文字颜色" value={item.color} onChange={color => update({ color })} />
        </Section>}
      </> : objects.length ? <><Section title={'已选择 ' + objects.length + ' 个对象'}>
        <div className="field-grid"><button className="outlined" onClick={() => onGroup(false)}><Group size={15} />组合</button>
          {groupSelected && <button className="outlined" onClick={() => onGroup(true)}><Ungroup size={15} />取消组合</button>}</div>
      </Section><Section title="对齐">
        <div className="field-grid">
          <button className="outlined" onClick={() => onAlign('left')}>左对齐</button>
          <button className="outlined" onClick={() => onAlign('center')}>水平居中</button>
          <button className="outlined" onClick={() => onAlign('top')}>顶部对齐</button>
          <button className="outlined" onClick={() => onAlign('middle')}>垂直居中</button>
        </div>
      </Section></> : <>
        <div className="object-heading"><div className="object-icon"><Square size={19} /></div><div><strong>画布</strong><span>页面设置</span></div></div>
        <Section title="画布尺寸"><div className="field-grid">
          <NumberField label="宽度" value={project.width} min={320} max={MAX_PAGE.width} onChange={width => onProject({ width: Math.round(width) })} />
          <NumberField label="高度" value={project.height} min={240} max={MAX_PAGE.height} onChange={height => onProject({ height: Math.round(height) })} />
        </div><ColorField label="背景" value={project.background} onChange={background => onProject({ background })} palettes /></Section>
        <p className="inspector-tip">选择画布中的对象，即可调整位置、颜色和文字。</p>
      </>}
    </div>
    {objects.length > 0 && <div className="object-actions">
      <button className="icon-button" onClick={() => onLayer('up')} title="移上一层"><ArrowUpToLine size={17} /></button>
      <button className="icon-button" onClick={() => onLayer('down')} title="移下一层"><ArrowDownToLine size={17} /></button>
      <button className="icon-button" onClick={onDuplicate} title="复制对象"><Copy size={17} /></button>
      <button className="icon-button destructive" onClick={onDelete} title="删除对象"><Trash2 size={17} /></button>
    </div>}
  </aside>
}
