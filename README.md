# 课图快画

课图快画是一款面向课程作业、实验报告和答辩的矢量绘图工具。第一次打开会显示一个可编辑的单摆实验流程图。也可以从空白画布、12 个场景模板或一段自然语言描述开始。

本项目对应「码力同行 · 实践挑战」原创赛道赛题 2。参赛材料见 [开发与验证记录](docs/development.md) 和 [项目演示视频](docs/demo.mp4)。

## 本地运行

需要 Node.js 20.19+（20.x）或 22.12+、npm 和支持 SVG、Canvas 与本地存储的现代浏览器。

```bash
npm ci
npm run dev
```

访问终端显示的本地地址，默认是 `http://localhost:5173/`。使用 Windows PowerShell 时，可以用 `npm.cmd` 执行相同命令。

```bash
npm run check
npm run build
npm run preview
```

构建产物位于 `dist/`，可由静态 HTTP 服务提供，支持部署在仓库子路径下。编辑、模板、按步骤生成和导出均在浏览器内运行。

## 使用方式

1. 在左侧选择「实验流程图」等模板，或点「新建画布」。「全部模板」可按六类筛选。「图形库」提供 18 种节点，包括数据库、队列、文档和里程碑。
2. 选中节点后点击任一侧的「＋」，挑选新节点即可自动连线。把「＋」拖向已有节点，可吸附并连线。拖到空白处会在该方向添加分支。使用箭头工具时，点击一个节点选择起点，再点击另一个节点选择终点。节点悬停时会显示四个连接点，拖动连接点也可以吸附到目标节点。需要批量连接时，选中多个节点并打开「视图 → 自动连线」。
3. 选择已有箭头后，箭头两端会显示橙色端点。拖动任一端点可以改变箭头长度和方向，靠近节点时会吸附到节点边缘，拖离节点后会变成自由端点。
4. 双击对象在画布上直接修改文字，Enter 确认，Shift + Enter 换行。拖动对象可以移动，四角手柄调整尺寸，上方圆点旋转。属性面板提供折线、曲线和分支标签。节点靠近边缘时，画布会按内容增大。
5. 按住 Shift 点击或拖框选中多个对象，可以对齐、组合、复制和调整图层。用「视图」里的网格吸附和横向或纵向自动布局整理草稿。
6. 修改会自动保存到当前浏览器。在右上角项目菜单或导出窗口下载 `.ketu.json` 备份，之后用「打开项目文件」继续编辑。
7. 用「导出」下载 1× 或 2× PNG 或 SVG，选中「透明背景」可只保留图形。导出文件仅包含作品内容。

「AI 生成 → 按步骤生成」接受逐行步骤或 `→`，首行可写 `标题：课程作业提交`。含问号的步骤会生成判断节点。

### 从需求生成示意图

打开「AI 生成」，选择图类型并输入需求，然后点「生成预览」。结果可以建立新项目。有节点选中时，也可把生成结果接到当前节点。勾选续写后，生成请求会包含当前图的标题和该节点文字。

- **本机 Qwen**适合简短的工作流程和分支草稿。服务启动后，工作台会自动检测到它。这个模型通过 CPU 推理，可以在没有 API 密钥的情况下使用。
- **Ollama、DeepSeek、OpenAI**提供预设接口，填写实际模型 ID 和服务所需密钥。开发和预览时，环回地址上的 Vite 为这些预设提供固定目标转发。本项目也支持填写兼容 Chat Completions 的完整自定义接口。静态部署直连时，接口须支持跨域访问。
- **导入模型结果**可复制提示词，在已经登录的 LLM 中生成 JSON，再粘贴来预览和编辑。

接口、模型 ID 和使用方式会记住。密钥只留在当前页面内存。所选服务会收到需求文字。

#### 启动本机 Qwen

在项目根目录执行以下 PowerShell 命令。首次需要约 491 MB 的 Qwen GGUF 模型文件。

```powershell
npm.cmd --prefix tools/local-model ci
New-Item -ItemType Directory -Force tools/local-model/models
curl.exe -L --fail --retry 3 -o tools/local-model/models/qwen-0.5b.gguf https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf
npm.cmd --prefix tools/local-model start
```

保持模型终端运行，并在另一终端运行 `npm run dev`。服务监听本机 `127.0.0.1:11435`。已有模型文件也可通过 `npm --prefix tools/local-model start -- 路径` 指定。

## 技术栈

| 技术 | 用途 |
| --- | --- |
| React 19、TypeScript、Vite | 界面、类型检查、静态构建 |
| SVG | 图形渲染、选框、连接点及矢量导出 |
| Canvas 2D | 在浏览器内将 SVG 光栅化为 PNG |
| Web Storage、JSON、File API | 自动保存、项目文件下载与导入 |
| Lucide | 操作图标 |

## 第三方资源及许可证

| 资源来源 | 许可证 |
| --- | --- |
| [React、React DOM](https://github.com/facebook/react) | MIT |
| [Vite](https://github.com/vitejs/vite) | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| [Lucide React](https://github.com/lucide-icons/lucide) | ISC，源自 Feather 的部分适用 MIT |
| [React 类型声明](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT |
| [Qwen2.5-0.5B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF) | Apache-2.0 |
| [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) | MIT |

项目图标、内置示例和模板随项目源码提供。字体来自浏览器和操作系统的可用字体。实际分发的版权说明见 [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt)。源码使用 [MIT 许可证](LICENSE)。可选的模型服务由使用者自行配置，适用该服务的条款。

## AI 工具使用声明

- **工具名称**为 OpenAI Codex。
- **使用环节**包括选题讨论、功能设计、编辑器及图形模型初版实现、模板、导出、文档和浏览器验证。
- **人机协作**中，参与者根据校园已有软件和使用需求否定前两次选题，选定以课程、实验和答辩为场景的矢量示意图工具，并委托 Codex 实现。当前交付中的初版代码和自动化验证由 Codex 完成。参与者亲自完成的后续设计决策与源码修改，按实际 Git 提交和开发记录补充。
- **作品内 AI**可以通过外部模型生成流程图。默认的按步骤生成由本地规则解析与布局实现。
