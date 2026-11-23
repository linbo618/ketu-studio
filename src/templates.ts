import { connector, diagram, shape, type Diagram, type Shape } from './model'
import { makeNode } from './graphEdit'
import { arrange, type DiagramFamily } from './generate'
import type { SymbolId } from './symbols'

export interface Template {
  id: string
  name: string
  detail: string
  tone: string
  category: DiagramFamily
  create: () => Diagram
}

const green = { fill: '#e4f4eb', stroke: '#9bc1a9', color: '#21483b' }
const dark = { fill: '#195a46', stroke: '#195a46', color: '#ffffff' }
const yellow = { fill: '#fff4d9', stroke: '#dcc38a', color: '#685220' }
const blue = { fill: '#e7f2fd', stroke: '#9dbbda', color: '#234b6b' }
const purple = { fill: '#eee9fc', stroke: '#b7a7db', color: '#523f77' }

function heading(title: string, subtitle: string): Shape[] {
  return [
    shape('text', 76, 65, { text: title, width: 808, height: 54, fontSize: 36, color: '#153a2e', bold: true, align: 'left' }),
    shape('text', 76, 129, { text: subtitle, width: 808, height: 28, fontSize: 18, color: '#5d7368', align: 'left' }),
    shape('line', 81, 183, { width: 798, height: 0, stroke: '#deebe3', strokeWidth: 1.5 }),
  ]
}

function node(text: string, x: number, y: number, options: Partial<Shape> = {}) {
  return shape('rect', x, y, { ...green, text, bold: true, width: 166, height: 70, ...options })
}

export function experiment() {
  const start = node('开始', 80, 260, { ...dark, width: 107, radius: 35 })
  const prepare = node('器材准备', 227, 260)
  const measure = node('测量周期', 435, 260)
  const check = shape('diamond', 647, 236, { ...yellow, width: 174, height: 118, text: '数据有效？', bold: true })
  const report = node('绘图与分析', 435, 427)
  const end = node('提交报告', 227, 427, { ...dark, radius: 35 })
  const retry = node('重新测量', 820, 428, { ...yellow, width: 100, height: 59, fontSize: 15, dashed: true })
  const passLabel = shape('text', 645, 377, { width: 56, height: 28, text: '是', fontSize: 14, color: '#527565' })
  const retryLabel = shape('text', 824, 355, { width: 56, height: 27, text: '否', fontSize: 14, color: '#826a32' })
  return diagram('单摆实验流程图', [
    ...heading('单摆实验流程', '大学物理实验 · 记录摆长、周期与数据处理步骤'),
    connector(start, prepare), connector(prepare, measure), connector(measure, check),
    connector(check, report), connector(report, end), connector(check, retry, { dashed: true, stroke: '#b69b5f' }),
    start, prepare, measure, check, report, end, retry, passLabel, retryLabel,
  ])
}

function architecture() {
  const view = node('浏览器 / 界面', 362, 222, { ...dark, width: 236 })
  const api = node('业务逻辑', 362, 348, { ...blue, width: 236 })
  const cache = node('本地缓存', 145, 492, { ...purple, width: 185 })
  const database = node('数据存储', 628, 492, { ...green, width: 185 })
  return diagram('软件系统架构图', [
    ...heading('软件系统架构', '课程设计 · 展示界面、业务逻辑和数据存储'),
    connector(view, api), connector(api, cache), connector(api, database), view, api, cache, database,
  ])
}

function pipeline() {
  const nodes = [
    node('原始数据', 80, 304, { ...dark, width: 156 }),
    node('清洗与校验', 294, 304, { ...blue, width: 156 }),
    node('统计与分析', 508, 304, { ...purple, width: 156 }),
    node('图表与结论', 722, 304, { ...green, width: 156 }),
  ]
  return diagram('数据处理流程图', [
    ...heading('数据处理流程', '课程报告 · 从原始数据到可解释的结果'),
    ...nodes.slice(1).map((item, index) => connector(nodes[index], item)), ...nodes,
  ])
}

function research() {
  const main = node('研究问题', 384, 229, { ...dark, width: 192 })
  const review = node('文献梳理', 106, 366, { ...blue, width: 172 })
  const survey = node('调查与记录', 394, 366, { ...purple, width: 172 })
  const compare = node('对照分析', 682, 366, { ...yellow, width: 172 })
  const outcome = node('研究结论', 384, 500, { ...green, width: 192 })
  const methods = [review, survey, compare]
  return diagram('研究方法框架图', [
    ...heading('研究方法框架', '开题与答辩 · 展示研究问题、研究方法与结论'),
    ...methods.map(item => connector(main, item)), ...methods.map(item => connector(item, outcome)),
    main, review, survey, compare, outcome,
  ])
}

function scenario(id: string, name: string, detail: string, category: DiagramFamily, tone: string,
  steps: [SymbolId, string][], relations: [number, number, string?][], vertical = false): Template {
  return { id, name, detail, category, tone, create: () => {
    const nodes = steps.map(([type, label]) => makeNode(type, label))
    const arrows = relations.map(([from, to, text = '']) => connector(nodes[from], nodes[to], { text, route: 'elbow', fontSize: 13 }))
    return arrange(diagram(name, [...heading(name, detail), ...arrows, ...nodes]), vertical ? 'vertical' : 'horizontal')
  } }
}

export const templates: Template[] = [
  { id: 'experiment', name: '实验流程图', detail: '实验步骤、条件判断和结果整理', category: '实验流程图', tone: 'mint', create: experiment },
  { id: 'architecture', name: '软件架构图', detail: '前端、业务和数据层之间的关系', category: '系统架构图', tone: 'blue', create: architecture },
  { id: 'pipeline', name: '数据处理图', detail: '数据采集、清洗、分析与呈现', category: '数据管道图', tone: 'lavender', create: pipeline },
  { id: 'research', name: '研究方法图', detail: '研究问题、方法与结论的框架', category: '思维导图', tone: 'amber', create: research },
  scenario('submission', '作业提交与返工', '从初稿、要求检查到提交回执', '流程图', 'mint',
    [['terminal', '准备初稿'], ['decision', '格式合格？'], ['process', '修订材料'], ['document', '提交回执']],
    [[0, 1], [1, 2, '否'], [2, 1], [1, 3, '是']]),
  scenario('account', '注册与身份验证', '注册表单、验证码和账号创建', '流程图', 'lavender',
    [['input', '填写注册资料'], ['decision', '校验通过？'], ['process', '修正输入'], ['terminal', '账号创建成功']],
    [[0, 1], [1, 2, '否'], [1, 3, '是'], [2, 0]]),
  scenario('lost', '失物招领系统', '用户、网页、业务服务和数据存储', '系统架构图', 'blue',
    [['actor', '学生'], ['component', '校园网页'], ['interface', '认领服务'], ['database', '物品数据库'], ['queue', '通知队列']],
    [[0, 1], [1, 2], [2, 3], [2, 4]]),
  scenario('cloud', '网站部署拓扑', '访问入口、云端服务和缓存', '系统架构图', 'blue',
    [['actor', '访客'], ['cloud', '访问入口'], ['component', 'Web 服务'], ['database', '数据库'], ['component', '缓存']],
    [[0, 1], [1, 2], [2, 3], [2, 4]], true),
  scenario('defense', '答辩准备思维导图', '从内容、演示、问答三个方向展开', '思维导图', 'amber',
    [['concept', '课程答辩'], ['topic', '内容准备'], ['topic', '现场演示'], ['topic', '问答'], ['task', '梳理论点'], ['task', '录屏备用'], ['task', '准备追问']],
    [[0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [3, 6]], true),
  scenario('milestones', '两周项目路线图', '需求、原型、联调、验收的里程碑', '项目路线图', 'lavender',
    [['milestone', '需求明确'], ['task', '原型评审'], ['task', '开发联调'], ['milestone', '验收提交']],
    [[0, 1], [1, 2], [2, 3]]),
  scenario('control', '对照实验记录', '试验组和对照组并行记录', '实验流程图', 'mint',
    [['terminal', '样本编号'], ['process', '试验组'], ['process', '对照组'], ['input', '记录指标'], ['document', '汇总比较']],
    [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]]),
  scenario('survey', '问卷数据管道', '合并双渠道数据，去重后生成报表', '数据管道图', 'lavender',
    [['input', 'CSV 文件'], ['interface', '问卷接口'], ['subprocess', '校验去重'], ['database', '结果表'], ['document', '统计报表']],
    [[0, 2], [1, 2], [2, 3], [3, 4]]),
]
