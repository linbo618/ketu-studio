import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDownRight, Check, ChevronDown, ChevronRight, Diamond, Download, File, FlaskConical, FolderOpen, Grid2X2, Hand, HardDrive, Keyboard, Layers3, LayoutGrid, Maximize, Minus, MousePointer2, Network, PanelLeft, PenLine, Plus, Redo2, Save, ScanLine, SlidersHorizontal, Sparkles, Square, Target, Type, Undo2, Workflow, X, Ellipsis } from 'lucide-react'
import Canvas from './Canvas'
import Inspector from './Inspector'
import { SymbolPicker } from './SymbolPicker'
import { addLink, appendBranch, autoLink, growPage, makeNode, placeNode, type Side } from './graphEdit'
import Generator, { detectLocalModel, localQwen, readConnection, rememberConnection } from './Generator'
import type { SymbolId } from './symbols'
import { ExportDialog, Modal, ShortcutDialog, TemplatesDialog } from './Dialogs'
import { arrange } from './generate'
import { exportDrawing, pngCanDouble, saveProject } from './export'
import { experiment, templates } from './templates'
import { bounds, clamp, cloneShapes, diagram, isLine, isNode, parseDiagram, readLibrary, removeShapes, round, uid, writeLibrary, type Diagram, type Point, type Shape, type Tool } from './model'

const tools: { id: Tool; name: string; key: string; icon: ReactNode }[] = [
  { id: 'select', name: '选择', key: 'v', icon: <MousePointer2 size={18} /> },
  { id: 'hand', name: '平移', key: 'h', icon: <Hand size={18} /> },
  { id: 'rect', name: '矩形', key: 'r', icon: <Square size={18} /> },
  { id: 'ellipse', name: '椭圆', key: 'o', icon: <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="6.5" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg> },
  { id: 'diamond', name: '菱形', key: 'd', icon: <Diamond size={18} /> },
  { id: 'line', name: '直线', key: 'l', icon: <Minus size={19} className="diagonal" /> },
  { id: 'arrow', name: '箭头', key: 'a', icon: <ArrowUpIcon /> },
  { id: 'pen', name: '画笔', key: 'p', icon: <PenLine size={18} /> },
  { id: 'text', name: '文本', key: 't', icon: <Type size={18} /> },
]

function ArrowUpIcon() {
  return <ArrowDownRight size={19} className="diagonal-arrow" />
}

const templateIcons = [FlaskConical, Network, Workflow, Target]
type Dialog = 'templates' | 'generate' | 'export' | 'shortcuts' | 'delete' | 'symbols' | null
type History = { before: Diagram[]; after: Diagram[] }

export default function App() {
  const [library, setLibrary] = useState(() => readLibrary(experiment))
  const project = library.projects.find(item => item.id === library.active) ?? library.projects[0]
  const [selected, setSelected] = useState<string[]>(() => project.shapes.filter(item => item.text === '器材准备' && !item.hidden).map(item => item.id))
  const [tool, setTool] = useState<Tool>('select')
  const [zoom, setZoom] = useState(1)
  const [grid, setGrid] = useState(true)
  const [snap, setSnap] = useState(false)
  const [reset, setReset] = useState(0)
  const [history, setHistory] = useState<History>({ before: [], after: [] })
  const [dialog, setDialog] = useState<Dialog>(null)
  const [menu, setMenu] = useState<'view' | 'project' | null>(null)
  const [tab, setTab] = useState<'properties' | 'layers'>('properties')
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error: boolean }>()
  const [saved, setSaved] = useState(true)
  const clipboard = useRef<Shape[]>([])
  const input = useRef<HTMLInputElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(project.name)
  const [insertion, setInsertion] = useState<{ point: Point; source?: Shape; side?: Side }>()
  const [autoGrow, setAutoGrow] = useState(true)
  const [connection, setConnection] = useState(readConnection)
  useEffect(() => { rememberConnection(connection) }, [connection])
  useEffect(() => {
    const controller = new AbortController()
    void detectLocalModel(controller.signal).then(ready => {
      if (ready && !controller.signal.aborted) setConnection(current =>
        !current.model && current.provider === 'ollama' ? { ...localQwen, mode: current.mode } : current)
    })
    return () => controller.abort()
  }, [])
  const generationAnchor = selected.length === 1 ? project.shapes.find(item => item.id === selected[0] && isNode(item) && !item.hidden) : undefined

  useEffect(() => { setTitle(project.name) }, [project.id, project.name])
  useEffect(() => {
    try { writeLibrary(library); setSaved(true) }
    catch { setSaved(false) }
  }, [library])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(undefined), 4200)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    if (!menu) return
    function dismiss(event: PointerEvent) {
      if (!(event.target as Element).closest('[data-menu-root]')) setMenu(null)
    }
    window.addEventListener('pointerdown', dismiss)
    return () => window.removeEventListener('pointerdown', dismiss)
  }, [menu])

  function message(text: string, error = false) { setNotice({ text, error }) }
  function changeZoom(value: number) { setZoom(Math.round(clamp(value, .25, 3) * 100) / 100) }
  function fit() { setZoom(1); setReset(value => value + 1); setMenu(null) }
  function replace(next: Diagram) {
    setLibrary(state => ({ ...state, projects: state.projects.map(item => item.id === next.id ? next : item) }))
  }

  function commit(changes: Partial<Diagram>, selection?: string[]) {
    if (changes.shapes && changes.shapes.length > 1200) {
      message('此项目已达到 1200 个对象的上限', true)
      return false
    }
    setHistory(state => ({ before: [...state.before.slice(-59), project], after: [] }))
    replace({ ...project, ...changes, updatedAt: new Date().toISOString() })
    if (selection) setSelected(selection)
    return true
  }

  function undo() {
    const previous = history.before.at(-1)
    if (!previous) return
    setHistory({ before: history.before.slice(0, -1), after: [project, ...history.after] })
    replace({ ...previous, updatedAt: new Date().toISOString() })
    setSelected(ids => ids.filter(id => previous.shapes.some(item => item.id === id)))
  }

  function redo() {
    const next = history.after[0]
    if (!next) return
    setHistory({ before: [...history.before, project], after: history.after.slice(1) })
    replace({ ...next, updatedAt: new Date().toISOString() })
    setSelected(ids => ids.filter(id => next.shapes.some(item => item.id === id)))
  }

  function resetEditor() {
    setSelected([])
    setHistory({ before: [], after: [] })
    setTool('select')
    setLeftOpen(false)
    fit()
  }

  function create(next: Diagram, text?: string) {
    setLibrary(state => ({ active: next.id, projects: [next, ...state.projects] }))
    resetEditor()
    setDialog(null)
    if (text) message(text)
  }

  async function open(file?: File) {
    if (!file) return
    try {
      if (file.size > 12_000_000) throw new Error('项目文件超过 12 MB。')
      const parsed = parseDiagram(JSON.parse(await file.text()))
      create({ ...parsed, id: uid(), updatedAt: new Date().toISOString() }, '项目文件已打开')
    } catch (error) {
      message(error instanceof Error ? error.message === 'Unexpected end of JSON input' ? '项目文件不完整' : error.message : '无法读取该项目文件', true)
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  function saveLocal() {
    try { writeLibrary(library); setSaved(true); message('已保存到此浏览器') }
    catch { setSaved(false); message('本地存储空间不足，请下载项目文件', true) }
  }

  function copyItems(duplicate: boolean) {
    const keys = new Set(selected)
    const items = project.shapes.filter(item => keys.has(item.id) || item.from && item.to && keys.has(item.from) && keys.has(item.to))
    if (!items.length) return
    if (duplicate) paste(cloneShapes(project.shapes, items, 0))
    else { clipboard.current = cloneShapes(project.shapes, items, 0); message('已复制到编辑器剪贴板') }
  }

  function paste(items = clipboard.current) {
    if (!items.length) return
    const copies = cloneShapes(items, items)
    commit({ shapes: [...project.shapes, ...copies] }, copies.map(item => item.id))
  }

  function remove() {
    if (selected.length) commit({ shapes: removeShapes(project.shapes, selected) }, [])
  }

  function group(ungroup: boolean) {
    if (selected.length < 2 && !ungroup) return
    const key = ungroup ? undefined : uid()
    const groups = new Set(project.shapes.filter(item => selected.includes(item.id) && item.group).map(item => item.group))
    commit({ shapes: project.shapes.map(item => selected.includes(item.id) || groups.has(item.group) ? { ...item, group: key } : item) })
  }

  function commitShapes(shapes: Shape[], selection?: string[]) {
    commit(autoGrow ? growPage(project, shapes) : { shapes }, selection)
  }

  function openSymbols(point?: Point, source?: Shape, side?: Side) {
    setInsertion({ point: point ?? { x: project.width / 2, y: project.height / 2 }, source, side })
    setDialog('symbols')
  }

  function insertSymbol(id: SymbolId) {
    if (!insertion) return
    const { source, side, point } = insertion
    const item = placeNode(project, makeNode(id), point, source && side ? { node: source, side } : undefined, snap)
    const shapes = [...project.shapes, item]
    commitShapes(source ? addLink(shapes, source, item) : shapes, [item.id])
    setTool('select')
    setTab('properties')
    setDialog(null)
  }

  function connectSelection(direction: 'horizontal' | 'vertical') {
    const shapes = autoLink(project, selected, direction)
    setMenu(null)
    if (shapes === project.shapes) { message('选择至少两个未按此方向连接的节点'); return }
    commit({ shapes })
    message('已连接 ' + (shapes.length - project.shapes.length) + ' 条箭头')
  }

  function useGenerated(draft: Diagram, append: boolean) {
    if (!append || !generationAnchor) { create(draft, '已创建可编辑示意图'); return }
    const result = appendBranch(project, draft, generationAnchor)
    if (!commit(result.changes, result.selected)) throw new Error('接入后会超过项目的 1200 个对象上限。')
    fit()
    setDialog(null)
    message('已将生成的节点和连线接入当前图')
  }

  function layer(direction: 'up' | 'down') {
    const shapes = [...project.shapes]
    const ordered = direction === 'up' ? shapes.map((_, i) => i).reverse() : shapes.map((_, i) => i)
    let changed = false
    for (const i of ordered) {
      const j = i + (direction === 'up' ? 1 : -1)
      if (shapes[j] && selected.includes(shapes[i].id) && !selected.includes(shapes[j].id)) {
        [shapes[i], shapes[j]] = [shapes[j], shapes[i]]
        changed = true
      }
    }
    if (changed) commit({ shapes })
  }

  function align(axis: 'left' | 'center' | 'top' | 'middle') {
    const byId = new Map(project.shapes.map(item => [item.id, item]))
    const items = project.shapes.filter(item => selected.includes(item.id) && (!isLine(item) || !item.from && !item.to))
    if (items.length < 2) return
    const horizontal = axis === 'left' || axis === 'center'
    const centered = axis === 'center' || axis === 'middle'
    const coordinates = new Map(items.map(item => {
      const rect = bounds(item, byId)
      return [item.id, horizontal ? rect.x + (centered ? rect.width / 2 : 0) : rect.y + (centered ? rect.height / 2 : 0)]
    }))
    const positions = [...coordinates.values()]
    const target = centered ? (Math.min(...positions) + Math.max(...positions)) / 2 : Math.min(...positions)
    commit({ shapes: project.shapes.map(item => {
      const value = coordinates.get(item.id)
      if (value === undefined || value === target) return item
      return horizontal ? { ...item, x: round(item.x + target - value) } : { ...item, y: round(item.y + target - value) }
    }) })
  }

  function editText() {
    setTab('properties')
    if (window.innerWidth <= 1050) setRightOpen(true)
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-text-edit]')?.focus())
  }

  function rename() {
    const name = title.trim() || '未命名示意图'
    setTitle(name)
    if (name !== project.name) commit({ name })
  }

  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('input,textarea,select,[contenteditable]') || dialog) return
      const value = event.key.toLowerCase()
      const control = event.ctrlKey || event.metaKey
      if (control) {
        const command: Record<string, () => void> = {
          z: event.shiftKey ? redo : undo, y: redo, s: saveLocal, c: () => copyItems(false), d: () => copyItems(true),
          v: () => paste(), g: () => group(event.shiftKey),
          a: () => setSelected(project.shapes.filter(item => !item.hidden).map(item => item.id)),
        }
        if (command[value] && ((value !== 'c' && value !== 'v') || value === 'c' && selected.length || clipboard.current.length)) {
          event.preventDefault()
          command[value]()
        }
      } else if (!event.altKey) {
        const tool = tools.find(item => item.key === value)
        if (tool) setTool(tool.id)
        if (value === 'escape') { setSelected([]); setTool('select'); setMenu(null) }
        if (value === 'delete' || value === 'backspace') { event.preventDefault(); remove() }
        const distance = event.shiftKey ? 10 : 1
        const moves: Record<string, [number, number]> = { arrowup: [0, -distance], arrowdown: [0, distance], arrowleft: [-distance, 0], arrowright: [distance, 0] }
        if (selected.length && moves[value]) {
          event.preventDefault()
          const [dx, dy] = moves[value]
          commit({ shapes: project.shapes.map(item => selected.includes(item.id) && !item.from && !item.to ? { ...item, x: item.x + dx, y: item.y + dy } : item) })
        }
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  return <div className="studio">
    {leftOpen && <button className="mobile-backdrop" aria-label="关闭项目导航" onClick={() => setLeftOpen(false)} />}
    {rightOpen && <button className="mobile-backdrop" aria-label="关闭属性面板" onClick={() => setRightOpen(false)} />}
    <aside className={'sidebar' + (leftOpen ? ' mobile-open' : '')}>
      <div className="brand">
        <img src={import.meta.env.BASE_URL + 'mark.svg'} width="39" height="39" alt="" />
        <div><strong>课图快画</strong><span>示意图工作台</span></div>
        <button className="icon-button panel-close" title="收起项目导航" onClick={() => setLeftOpen(false)}><X size={17} /></button>
      </div>
      <div className="sidebar-content">
        <button className="primary new-project" onClick={() => create(diagram())}><Plus size={18} />新建画布</button>
        <button className="sidebar-link file-open" onClick={() => input.current?.click()}><FolderOpen size={17} />打开项目文件</button>
        <div className="nav-section">
          <div className="nav-heading"><h2>场景模板</h2><button className="icon-button" title="浏览全部模板" onClick={() => setDialog('templates')}><LayoutGrid size={15} /></button></div>
          {templates.slice(0, templateIcons.length).map((template, index) => {
            const Icon = templateIcons[index]
            return <button key={template.id} className="sidebar-link template-link" onClick={() => create(template.create(), '已从模板创建新项目')}>
              <span className={'template-icon ' + template.tone}><Icon size={16} /></span>{template.name}
            </button>
          })}
          <button className="sidebar-link templates-all" onClick={() => setDialog('templates')}><LayoutGrid size={16} />全部模板<span>{templates.length}</span></button>
        </div>
        <div className="nav-section project-section">
          <div className="nav-heading"><h2>我的项目</h2><span>{library.projects.length}</span></div>
          <div className="project-list">{library.projects.map(item => <button key={item.id} className={'sidebar-link project-link' + (item.id === project.id ? ' current' : '')}
            title={item.name} aria-current={item.id === project.id ? 'page' : undefined} onClick={() => {
              if (item.id !== project.id) { setLibrary(state => ({ ...state, active: item.id })); resetEditor() }
              setLeftOpen(false)
            }}><File size={16} /><span>{item.name}</span>{item.id === project.id && <span className="project-dot" />}</button>)}</div>
        </div>
      </div>
      <div className="sidebar-bottom">
        <button className="generate-card" onClick={() => setDialog('generate')}>
          <span className="generate-icon"><Sparkles size={17} /></span><span><strong>AI 示意图</strong><small>生成和续画可编辑图形</small></span><ChevronRight size={15} />
        </button>
        <button className="sidebar-link keyboard-link" onClick={() => setDialog('shortcuts')}><Keyboard size={17} />键盘快捷键</button>
      </div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <button className="icon-button mobile-projects" title="打开项目导航" onClick={() => { setLeftOpen(!leftOpen); setRightOpen(false) }}><PanelLeft size={20} /></button>
        <div className="breadcrumb"><span>工作台</span><ChevronRight size={14} /><input ref={titleRef} aria-label="项目名称" value={title} maxLength={80}
          onChange={event => setTitle(event.target.value)} onBlur={rename} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></div>
        <span className={'save-status' + (saved ? '' : ' warning')} title={saved ? '保存在当前浏览器中' : '请下载项目文件备份'}><HardDrive size={15} />{saved ? '本地已保存' : '本地保存失败'}</span>
        <div className="top-actions">
          <div className="undo-group"><button className="icon-button" title="撤销 (Ctrl+Z)" disabled={!history.before.length} onClick={undo}><Undo2 size={18} /></button>
            <button className="icon-button" title="重做 (Ctrl+Shift+Z)" disabled={!history.after.length} onClick={redo}><Redo2 size={18} /></button></div>
          <button className="outlined save-button" onClick={saveLocal} title="保存到浏览器"><Save size={16} /><span>保存</span></button>
          <button className="primary export-button" onClick={() => setDialog('export')}><Download size={16} /><span>导出</span></button>
          <div className="menu-root" data-menu-root>
            <button className="icon-button" title="项目选项" onClick={() => setMenu(menu === 'project' ? null : 'project')}><Ellipsis size={19} /></button>
            {menu === 'project' && <div className="popover">
              <button onClick={() => { titleRef.current?.focus(); titleRef.current?.select(); setMenu(null) }}>重命名项目</button>
              <button onClick={() => { saveProject(project); setMenu(null); message('已下载项目文件') }}>下载项目文件</button>
              <button className="danger-label" onClick={() => { setMenu(null); setDialog('delete') }}>删除此项目</button>
            </div>}
          </div>
        </div>
      </header>

      <div className="editor">
        <section className="canvas-panel" aria-label="绘图编辑器">
          <div className="canvas-bar">
          <div className="canvas-tab"><Layers3 size={16} /><span>编辑画布</span></div>
            <div className="canvas-actions">
              <button className="outlined add-symbols" onClick={() => openSymbols()}><Plus size={15} /><span>图形库</span></button>
              <button className="outlined quick-ai" onClick={() => setDialog('generate')}><Sparkles size={15} /><span>AI 生成</span></button>
              <button className={'outlined grid-button' + (grid ? ' active' : '')} onClick={() => setGrid(!grid)} aria-label="网格" aria-pressed={grid}><Grid2X2 size={15} /><span>网格</span></button>
              <div className="menu-root" data-menu-root>
                <button className="outlined view-button" onClick={() => setMenu(menu === 'view' ? null : 'view')}><ScanLine size={16} /><span>视图</span><ChevronDown size={13} /></button>
                {menu === 'view' && <div className="popover">
                  <button onClick={fit}>适应窗口</button>
                  <button onClick={() => setSnap(!snap)}>网格吸附 {snap && <Check size={15} />}</button>
                  <button onClick={() => setAutoGrow(!autoGrow)}>自动扩展画布 {autoGrow && <Check size={15} />}</button>
                  <button onClick={() => connectSelection('horizontal')}>自动连线 · 从左到右</button>
                  <button onClick={() => connectSelection('vertical')}>自动连线 · 从上到下</button>
                  <button onClick={() => { commit(arrange(project, 'horizontal')); fit() }}>自动布局 · 横向</button>
                  <button onClick={() => { commit(arrange(project, 'vertical')); fit() }}>自动布局 · 纵向</button>
                </div>}
              </div>
              <button className="icon-button mobile-properties" title="打开属性面板" onClick={() => { setRightOpen(!rightOpen); setLeftOpen(false) }}><SlidersHorizontal size={18} /></button>
            </div>
          </div>
          <div className="canvas-body">
            <div className="toolbar" aria-label="绘图工具">{tools.map((item, index) => <div key={item.id} className={index === 2 || index === 8 ? 'tool-divider' : undefined}>
              <button className={'tool-button' + (tool === item.id ? ' current' : '')} title={item.name + ' (' + item.key.toUpperCase() + ')'}
                aria-label={item.name} aria-pressed={tool === item.id} onClick={() => setTool(item.id)}>{item.icon}<span>{item.name}</span></button>
            </div>)}</div>
            <Canvas project={project} svgRef={svgRef} selected={selected} tool={tool} onSelect={setSelected} onCommit={commitShapes}
              onFinishTool={() => setTool('select')} onEdit={editText} zoom={zoom} onZoom={changeZoom} grid={grid} snap={snap} reset={reset} onTemplates={() => setDialog('templates')}
              onExpand={openSymbols} onText={(id, text) => commit({ shapes: project.shapes.map(item => item.id === id ? { ...item, text } : item) })} />
          </div>
          <footer className="statusbar">
            <span className="object-count"><span />{project.shapes.length} 个对象{selected.length ? ' · 已选 ' + selected.length : ''}</span>
            <div className="zoom-tools">
              <button className="icon-button small" title="缩小" onClick={() => changeZoom(zoom - .1)}><Minus size={15} /></button>
              <button className="zoom-value" title="重置缩放" onClick={fit}>{Math.round(zoom * 100)}%</button>
              <button className="icon-button small" title="放大" onClick={() => changeZoom(zoom + .1)}><Plus size={15} /></button>
              <button className="icon-button small fit-button" title="适应窗口" onClick={fit}><Maximize size={15} /></button>
            </div>
            <span className="canvas-dimensions">{project.width} × {project.height} px</span>
          </footer>
        </section>

        <Inspector project={project} selected={selected} tab={tab} onTab={setTab} onSelect={setSelected}
          onShape={(id, change) => commit({ shapes: project.shapes.map(item => item.id === id ? { ...item, ...change } : item) })}
          onProject={commit} onDelete={remove} onDuplicate={() => copyItems(true)} onGroup={group} onLayer={layer} onAlign={align}
          mobileOpen={rightOpen} onClose={() => setRightOpen(false)} />
      </div>
    </main>

    <input type="file" ref={input} accept=".json,application/json" hidden onChange={event => void open(event.target.files?.[0])} />
    {dialog === 'templates' && <TemplatesDialog onClose={() => setDialog(null)} onCreate={result => create(result, '已从模板创建新项目')} />}
    {dialog === 'symbols' && <SymbolPicker onClose={() => setDialog(null)} onPick={insertSymbol} linked={Boolean(insertion?.source)} />}
    {dialog === 'generate' && <Generator onClose={() => setDialog(null)} onUse={useGenerated}
      anchor={generationAnchor} project={project} connection={connection} onConnection={setConnection} />}
    {dialog === 'shortcuts' && <ShortcutDialog onClose={() => setDialog(null)} />}
    {dialog === 'export' && <ExportDialog canDouble={pngCanDouble(project)} onClose={() => setDialog(null)} onSave={() => { saveProject(project); message('已下载项目文件') }}
      onExport={async (format, transparent, scale) => {
        try {
          if (!svgRef.current) throw new Error('画布未加载')
          await exportDrawing(svgRef.current, project, format, transparent, scale)
          setDialog(null)
          message(format.toUpperCase() + ' 已导出')
        } catch (error) {
          setDialog(null)
          message(error instanceof Error ? error.message : '导出失败', true)
        }
      }} />}
    {dialog === 'delete' && <Modal title="删除项目" description={'将从此浏览器删除「' + project.name + '」。'} onClose={() => setDialog(null)}>
      <div className="dialog-footer"><button className="outlined" onClick={() => setDialog(null)}>取消</button><button className="danger" onClick={() => {
        const remaining = library.projects.filter(item => item.id !== project.id)
        if (!remaining.length) remaining.push(diagram())
        setLibrary({ active: remaining[0].id, projects: remaining })
        resetEditor()
        setDialog(null)
        message('项目已删除')
      }}>删除项目</button></div>
    </Modal>}
    {notice && <div className={'toast' + (notice.error ? ' error-toast' : '')} role="status">{notice.error ? <X size={16} /> : <Check size={17} />}{notice.text}</div>}
  </div>
}
