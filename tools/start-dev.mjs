import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const modelDirectory = resolve(root, 'tools', 'local-model')
const modelFile = resolve(modelDirectory, 'models', 'qwen-0.5b.gguf')
const modelEntry = resolve(modelDirectory, 'server.mjs')
const viteEntry = resolve(root, 'node_modules', 'vite', 'bin', 'vite.js')
const children = []
let shuttingDown = false

async function available(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(900) })
    return response.status === 204 || response.ok
  } catch {
    return false
  }
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function run(command, args, name) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true })
  children.push(child)
  child.once('exit', (code, signal) => {
    if (shuttingDown) return
    if (name === 'model') {
      console.error('[课图快画] 本地模型进程已退出。请查看上面的错误信息。')
    } else if (code && code !== 0) {
      console.error('[课图快画] 网页服务退出，状态码 ' + code + '。')
      void shutdown(code)
    } else if (signal) {
      void shutdown(0)
    }
  })
  return child
}

async function waitForModel() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await available('http://127.0.0.1:11435/health')) {
      console.log('[课图快画] 本机 Qwen 已就绪，AI 示意图可以直接使用。')
      return true
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 600))
  }
  console.warn('[课图快画] 网页已启动，但本机模型仍在加载。模型就绪后刷新 AI 生成窗口即可。')
  return false
}

async function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null) child.kill()
  }
  setTimeout(() => process.exit(code), 200)
}

process.once('SIGINT', () => void shutdown(0))
process.once('SIGTERM', () => void shutdown(0))

if (await available('http://127.0.0.1:11435/health')) {
  console.log('[课图快画] 检测到本机 Qwen 已在运行，复用现有服务。')
} else if (!(await exists(modelFile))) {
  console.warn('[课图快画] 未找到 tools/local-model/models/qwen-0.5b.gguf，本次只启动网页。')
  console.warn('[课图快画] 按 README 的本机 Qwen 步骤下载模型后，再运行 npm run dev。')
} else if (!(await exists(resolve(modelDirectory, 'node_modules', 'node-llama-cpp')))) {
  console.warn('[课图快画] 本地模型依赖未安装，本次只启动网页。')
  console.warn('[课图快画] 执行 npm.cmd --prefix tools/local-model ci 后，再运行 npm run dev。')
} else {
  console.log('[课图快画] 正在启动本机 Qwen，首次加载可能需要几十秒。')
  run(process.execPath, [modelEntry], 'model')
  void waitForModel()
}

run(process.execPath, [viteEntry, ...process.argv.slice(2)], 'web')
