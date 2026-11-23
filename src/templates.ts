import { connector, diagram, shape, type Diagram, type Shape } from './model'

export interface Template {
  id: string
  name: string
  detail: string
  tone: string
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

export const templates: Template[] = [
  { id: 'experiment', name: '实验流程图', detail: '实验步骤、条件判断和结果整理', tone: 'mint', create: experiment },
  { id: 'architecture', name: '软件架构图', detail: '前端、业务和数据层之间的关系', tone: 'blue', create: architecture },
  { id: 'pipeline', name: '数据处理图', detail: '数据采集、清洗、分析与呈现', tone: 'lavender', create: pipeline },
  { id: 'research', name: '研究方法图', detail: '研究问题、方法与结论的框架', tone: 'amber', create: research },
]
