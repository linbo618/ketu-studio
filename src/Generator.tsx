import { useEffect, useRef, useState } from 'react'
import { Braces, ChevronDown, ClipboardCopy, PencilRuler, Settings2, Sparkles } from 'lucide-react'
import { Modal } from './Dialogs'
import { Drawing } from './Drawing'
import { diagramFamilies, fromAI, fromModelResult, fromOutline, graphPrompt, type DiagramFamily } from './generate'
import { isNode, type Diagram, type Direction, type Shape } from './model'

const providers = {
  qwen: { label: '本机 Qwen', endpoint: 'http://127.0.0.1:11435/v1/chat/completions', proxy: 'qwen' },
  ollama: { label: 'Ollama（本机）', endpoint: 'http://127.0.0.1:11434/v1/chat/completions', proxy: 'ollama' },
  deepseek: { label: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', proxy: 'deepseek' },
  openai: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', proxy: 'openai' },
  custom: { label: '自定义接口', endpoint: '', proxy: '' },
}
type Provider = keyof typeof providers
type Mode = 'ai' | 'paste' | 'local'
type Stage = 'idle' | 'reading' | 'interpreting' | 'planning' | 'rendering' | 'done'
type UseAction = 'current' | 'new' | 'append'
export type ModelConnection = { provider: Provider; endpoint: string; model: string; key: string; mode: Mode }
const storageKey = 'ketu-studio:model-settings'
export const localQwen: ModelConnection = { provider: 'qwen', endpoint: '', model: 'Qwen2.5-0.5B-Instruct', key: '', mode: 'ai' }

export function readConnection(): ModelConnection {
  const fallback: ModelConnection = { provider: 'ollama', endpoint: '', model: '', key: '', mode: 'ai' }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    if (!Object.hasOwn(providers, saved.provider)) return fallback
    return { provider: saved.provider, endpoint: typeof saved.endpoint === 'string' ? saved.endpoint : '',
      model: typeof saved.model === 'string' ? saved.model : '', key: '',
      mode: saved.mode === 'local' || saved.mode === 'paste' ? saved.mode : 'ai' }
  } catch { return fallback }
}

export function rememberConnection(config: ModelConnection) {
  try {
    const { provider, endpoint, model, mode } = config
    localStorage.setItem(storageKey, JSON.stringify({ provider, endpoint, model, mode }))
  } catch { /* The connection stays available in this tab. */ }
}

export async function detectLocalModel(signal: AbortSignal) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return false
  try {
    const response = await fetch('/__ketu-model/local', { signal: AbortSignal.any([signal, AbortSignal.timeout(1300)]) })
    return response.status === 204
  } catch { return false }
}

const samples: Record<DiagramFamily, string> = {
  '流程图': '绘制课程作业提交过程。从准备材料开始，检查命名与格式，不合格时返回修订，合格时上传并确认提交回执。',
  '系统架构图': '绘制校园失物招领系统。学生通过网页发布和认领，后端服务校验身份并把物品描述存入数据库，认领结果通过消息队列发送通知。',
  '思维导图': '以课程答辩为中心，建立内容准备、现场演示、问答三个分支。每个分支列出两个具体事项。',
  '项目路线图': '为两周课程项目安排里程碑，从需求与原型开始，完成开发联调后验收并提交。',
  '实验流程图': '从搭建单摆开始，测量摆长，记录多次摆动周期，判断偏差是否可接受，否则重测，最后作图并提交报告。',
  '数据管道图': '从 CSV 和问卷接口收集数据，经格式校验去重后写入数据库，最后生成统计报表。',
}
const localExample = '标题：课程作业提交\n开始\n准备材料\n检查格式？\n上传作业\n确认提交'
const stages: { id: Stage; label: string }[] = [
  { id: 'reading', label: '读取当前画布' },
  { id: 'interpreting', label: '理解需求' },
  { id: 'planning', label: '规划节点和连线' },
  { id: 'rendering', label: '生成并布局' },
]

async function modelEndpoint(provider: Provider, custom: string, signal: AbortSignal) {
  if (provider === 'custom') return custom.trim()
  const preset = providers[provider]
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    try {
      const status = await fetch('/__ketu-model/health', { signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) })
      if (status.headers.get('x-ketu-model-bridge') === 'available') return '/__ketu-model/' + preset.proxy
    } catch { /* A static build can use the service URL directly. */ }
  }
  return preset.endpoint
}

export default function Generator({ onClose, onUse, connection, onConnection, anchor, project }: {
  onClose: () => void
  onUse: (draft: Diagram, action: UseAction) => void
  connection: ModelConnection
  onConnection: (connection: ModelConnection) => void
  anchor?: Shape
  project: Diagram
}) {
  const [description, setDescription] = useState('')
  const [pasted, setPasted] = useState('')
  const [family, setFamily] = useState<DiagramFamily>('流程图')
  const [direction, setDirection] = useState<Direction>('horizontal')
  const [settings, setSettings] = useState(!connection.model)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copyHint, setCopyHint] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [includeContext, setIncludeContext] = useState(false)
  const [draft, setDraft] = useState<Diagram>()
  const [stage, setStage] = useState<Stage>('idle')
  const request = useRef<AbortController | null>(null)
  const mode = connection.mode
  const provider = providers[connection.provider]

  useEffect(() => () => { request.current?.abort(); request.current = null }, [])

  const brief = description.trim() || samples[family]
  const currentNodes = project.shapes.filter(item => isNode(item) && !item.hidden).slice(0, 24)
  const currentEdges = project.shapes.filter(item => item.from && item.to && !item.hidden).slice(0, 36)
  const canvasContext = '\n当前画布上下文：' + JSON.stringify({
    name: project.name, width: project.width, height: project.height,
    nodes: currentNodes.map(item => ({ id: item.id, type: item.symbol ?? item.kind, label: item.text, x: Math.round(item.x), y: Math.round(item.y), width: Math.round(item.width), height: Math.round(item.height) })),
    edges: currentEdges.map(item => ({ from: item.from, to: item.to, label: item.text, route: item.route ?? 'straight' })),
  })
  const continuation = anchor && includeContext ? '\n续写要求：选中节点是「' + (anchor.text || '当前节点') +
    '」，生成可以接在该节点之后的新分支，并保留当前布局关系。' : ''
  const modelPrompt = '图形类型：' + family + canvasContext + continuation + '\n需求：' + brief
  const prompt = graphPrompt + '\n' + modelPrompt

  const update = (fields: Partial<ModelConnection>) => onConnection({ ...connection, ...fields })

  async function generate() {
    if (request.current) return
    setError('')
    if (mode !== 'paste' && !description.trim()) { setError('输入需求，或先填入示例。'); return }
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setDraft(undefined)
    setStage('reading')
    try {
      await new Promise(resolve => setTimeout(resolve, 220))
      if (controller.signal.aborted) throw new Error('已取消生成。')
      setStage('interpreting')
      await new Promise(resolve => setTimeout(resolve, 220))
      if (controller.signal.aborted) throw new Error('已取消生成。')
      setStage('planning')
      if (mode === 'ai' && !connection.model.trim()) { setSettings(true); throw new Error('先填写已安装或可以访问的模型 ID。') }
      if (mode === 'ai' && connection.provider === 'custom' && !connection.endpoint.trim()) { setSettings(true); throw new Error('先填写模型接口地址。') }
      if (mode === 'ai' && (connection.provider === 'deepseek' || connection.provider === 'openai') && !connection.key.trim()) {
        setSettings(true)
        throw new Error('填入服务商提供的 API 密钥。')
      }
      const result = mode === 'paste' ? fromModelResult(pasted, direction)
        : mode === 'local' ? fromOutline(description, direction)
          : await fromAI(modelPrompt, direction, family, {
            endpoint: await modelEndpoint(connection.provider, connection.endpoint, controller.signal),
            model: connection.model, key: connection.key.trim(),
          }, controller.signal)
      if (request.current === controller) {
        setStage('rendering')
        await new Promise(resolve => setTimeout(resolve, 180))
        setDraft(result)
        setStage('done')
      }
    } catch (cause) {
      if (request.current === controller) {
        setStage('idle')
        setError(cause instanceof Error ? cause.message : '生成失败。')
      }
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false) }
    }
  }

  function stop() {
    request.current?.abort()
    request.current = null
    setBusy(false)
    setStage('idle')
    setError('已停止生成，可以修改需求后重试。')
  }

  function useDraft(action: UseAction) {
    if (!draft) return
    try { onUse(draft, action) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法接入当前项目。') }
  }

  return <Modal title="AI 示意图工作台" description="从需求生成可编辑的节点和连线。" onClose={onClose} wide>
    <form className="dialog-form generator-form" onSubmit={event => { event.preventDefault(); void generate() }}>
      <fieldset disabled={busy} className="generator-inputs">
        <div className="segmented generator-modes">
          {([
            ['ai', '调用模型', Sparkles], ['paste', '导入模型结果', Braces], ['local', '按步骤生成', PencilRuler],
          ] as const).map(([id, name, Icon]) => <button key={id} type="button" className={mode === id ? 'current' : ''}
            onClick={() => { update({ mode: id }); setError(''); setDraft(undefined); setDescription('') }} aria-pressed={mode === id}><Icon size={15} />{name}</button>)}
        </div>
        <div className="row-options">
          {mode !== 'local' && <label>图类型<span className="select-wrap"><select value={family} onChange={event => setFamily(event.target.value as DiagramFamily)}>
            {diagramFamilies.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></span></label>}
          <label>布局方向<span className="select-wrap"><select value={direction} onChange={event => setDirection(event.target.value as Direction)}>
            <option value="horizontal">从左到右</option><option value="vertical">从上到下</option>
          </select><ChevronDown size={14} /></span></label>
        </div>
        {anchor && mode !== 'local' && <label className="generation-context check-field">
          <input type="checkbox" checked={includeContext} onChange={event => setIncludeContext(event.target.checked)} />
          续写「{anchor.text || '选中节点'}」的分支
        </label>}
        <div><div className="label-row"><label htmlFor="outline">{mode === 'local' ? '流程步骤' : '需求描述'}</label>
          <button type="button" className="text-button" onClick={() => setDescription(mode === 'local' ? localExample : samples[family])}>填入示例</button></div>
          <textarea id="outline" rows={3} maxLength={6000} value={description} onChange={event => setDescription(event.target.value)}
            placeholder={mode === 'local' ? '每行一个步骤，或用 → 分隔' : samples[family]} />
        </div>
        <section className="canvas-context" aria-label="当前画布摘要">
          <div><strong>当前画布</strong><span>{project.name} · {currentNodes.length} 个节点 · {currentEdges.length} 条连线</span></div>
          <p>{currentNodes.length ? currentNodes.slice(0, 8).map(item => item.text || item.symbol || item.kind).join('、') + (currentNodes.length > 8 ? '…' : '') : '空白画布'}</p>
        </section>
        {mode === 'ai' && <div className="connection-box">
          <button type="button" className="connection-toggle" aria-expanded={settings} onClick={() => setSettings(!settings)}>
            <Settings2 size={16} /><span>{connection.model ? provider.label + ' · ' + connection.model : '配置模型连接'}</span><ChevronDown size={15} />
          </button>
          {settings && <div className="ai-fields">
            <label>模型服务<span className="select-wrap"><select value={connection.provider} onChange={event => {
              const provider = event.target.value as Provider
              update({ provider, model: provider === 'qwen' ? localQwen.model : '', key: '' })
            }}>{Object.entries(providers).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select><ChevronDown size={14} /></span></label>
            {connection.provider === 'custom' && <label>接口地址<input type="url" value={connection.endpoint} placeholder="https://…/v1/chat/completions"
              onChange={event => update({ endpoint: event.target.value })} /></label>}
            <label>模型 ID<input value={connection.model} readOnly={connection.provider === 'qwen'} placeholder={connection.provider === 'ollama' ? 'ollama list 中显示的模型名' : '服务商提供的模型 ID'}
              onChange={event => update({ model: event.target.value })} /></label>
            {connection.provider !== 'ollama' && connection.provider !== 'qwen' && <label>API 密钥<input type="password" autoComplete="off" value={connection.key}
              onChange={event => update({ key: event.target.value })} /></label>}
            <p>{connection.provider === 'qwen' ? '使用本机运行的 Qwen，适合简短的生成任务。' : connection.provider === 'ollama' ? '使用本机已启动的 Ollama 模型。' : '生成请求会把描述发送给所选模型服务。密钥只保留在当前页面内存。'}</p>
          </div>}
        </div>}
        {mode === 'paste' && <>
          <div className="label-row"><label htmlFor="model-result">模型输出</label><button type="button" className="text-button" onClick={async () => {
            try { await navigator.clipboard.writeText(prompt); setCopyHint('已复制提示词') }
            catch { setShowPrompt(true); setCopyHint('提示词已展开，可手动复制') }
          }}><ClipboardCopy size={15} />复制提示词</button></div>
          {showPrompt && <textarea aria-label="提示词" value={prompt} readOnly rows={3} />}
          {copyHint && <p role="status" className="field-note">{copyHint}</p>}
          <textarea id="model-result" rows={4} value={pasted} onChange={event => setPasted(event.target.value)}
            placeholder="将提示词发给你使用的 LLM，再粘贴它返回的 JSON。" />
        </>}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      {(busy || stage === 'done') && <section className="ai-process" aria-label="AI 生成过程">
        <div className="process-heading"><strong>生成过程</strong><span>{stage === 'done' ? '已完成' : '进行中'}</span></div>
        <div className="process-steps">{stages.map((item, index) => {
          const currentIndex = stages.findIndex(stageItem => stageItem.id === stage)
          const itemIndex = index
          const done = stage === 'done' || currentIndex > itemIndex
          const current = item.id === stage
          return <div key={item.id} className={'process-step' + (done ? ' done' : '') + (current ? ' current' : '')}>
            <span>{done ? '✓' : index + 1}</span><label>{item.label}</label>
          </div>
        })}</div>
        {stage === 'done' && draft && <p className="process-result">已生成 {draft.shapes.filter(item => item.symbol).length} 个节点和 {draft.shapes.filter(item => item.from && item.to).length} 条连线，已完成自动布局。</p>}
      </section>}
      {draft && <section className="draft-preview">
        <div><strong>{draft.name}</strong><span>{draft.shapes.filter(item => item.symbol).length} 个节点</span></div>
        <Drawing project={draft} />
      </section>}
      <div className="dialog-footer generator-footer">
        {busy ? <><span role="status">模型生成中…</span><button type="button" className="outlined" onClick={stop}>停止</button></>
          : <><button className={draft ? 'outlined' : 'primary'} type="submit"><Sparkles size={16} />{draft ? '重新生成' : '生成预览'}</button>
            {draft && <button type="button" className="primary" onClick={() => useDraft('current')}>应用到当前图</button>}
            {draft && <button type="button" className="outlined" onClick={() => useDraft('new')}>新建副本</button>}
            {draft && anchor && <button type="button" className="outlined" onClick={() => useDraft('append')}>接到选中节点</button>}</>}
      </div>
    </form>
  </Modal>
}
