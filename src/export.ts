import { fileTitle, type Diagram } from './model'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function saveProject(project: Diagram) {
  download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), fileTitle(project.name) + '.ketu.json')
}

export async function exportDrawing(svg: SVGSVGElement, project: Diagram, format: 'svg' | 'png', transparent: boolean, scale = 2) {
  const copy = svg.cloneNode(true) as SVGSVGElement
  copy.removeAttribute('class')
  copy.removeAttribute('role')
  copy.removeAttribute('data-diagram')
  if (transparent) copy.firstElementChild?.remove()
  copy.querySelectorAll('[data-editor-only]').forEach(element => element.remove())
  copy.querySelectorAll('*').forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith('data-')) element.removeAttribute(attribute.name)
    }
  })
  const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' })
  const filename = fileTitle(project.name) + '.' + format
  if (format === 'svg') {
    download(blob, filename)
    return
  }

  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = project.width * scale
    canvas.height = project.height * scale
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法生成 PNG')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('无法编码 PNG')))
    })
    download(png, filename)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function pngCanDouble(project: Diagram) {
  return project.width * project.height * 4 <= 40_000_000
}
