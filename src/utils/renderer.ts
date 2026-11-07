import { getStroke } from 'perfect-freehand'
import type {
  Camera,
  ConnectorElement,
  FreehandElement,
  ShapeElement,
  TextElement,
  WhiteboardElement,
} from '../types/whiteboard'
import { getArrowheadPoints } from './geometry'

const pathCache = new WeakMap<FreehandElement, Path2D>()

function buildSvgPathFromStroke(points: number[][]): Path2D {
  const path = new Path2D()
  const len = points.length
  if (len === 0) return path

  const first = points[0]
  const second = points[1] ?? first
  path.moveTo((first[0] + second[0]) / 2, (first[1] + second[1]) / 2)

  for (let i = 1; i < len; i++) {
    const curr = points[i]
    const next = points[(i + 1) % len]
    path.quadraticCurveTo(
      curr[0],
      curr[1],
      (curr[0] + next[0]) / 2,
      (curr[1] + next[1]) / 2,
    )
  }

  path.closePath()
  return path
}

function getFreehandPath(el: FreehandElement): Path2D {
  const cached = pathCache.get(el)
  if (cached) return cached

  const pts = el.points
  const path = new Path2D()
  if (pts.length === 0) return path

  const start = pts[0]
  let maxDist = 0
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - start.x, pts[i].y - start.y)
    if (d > maxDist) maxDist = d
    if (maxDist >= 1.6) break
  }

  const isHighlighter = el.type === 'highlighter'

  // Guarantee crisp round dots for math decimals, colons, division symbols, and i-dots
  if (maxDist < 1.6) {
    const dotRadius = isHighlighter ? el.strokeWidth * 1.6 : el.strokeWidth * 0.56
    path.arc(start.x, start.y, Math.max(dotRadius, 1.2), 0, Math.PI * 2)
    pathCache.set(el, path)
    return path
  }

  const inputPoints = pts.map((p) => [p.x, p.y, p.pressure ?? 0.5])
  const outline = getStroke(inputPoints, {
    size: isHighlighter ? el.strokeWidth * 3.3 : el.strokeWidth,
    thinning: isHighlighter ? 0 : 0.42,
    smoothing: isHighlighter ? 0.68 : 0.56,
    streamline: isHighlighter ? 0.58 : 0.44,
    simulatePressure: !el.realPressure,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
  })

  const built = buildSvgPathFromStroke(outline)
  pathCache.set(el, built)
  return built
}

function renderFreehand(ctx: CanvasRenderingContext2D, el: FreehandElement, dimmed: boolean) {
  const path = getFreehandPath(el)
  ctx.save()
  if (el.type === 'highlighter') {
    const isDarkInk = el.color === '#18181b' || el.color === '#64748b'
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = (isDarkInk ? 0.16 : 0.34) * (dimmed ? 0.3 : 1)
  } else if (dimmed) {
    ctx.globalAlpha = 0.22
  }
  ctx.fillStyle = el.color
  ctx.fill(path)
  ctx.restore()
}

function renderShape(ctx: CanvasRenderingContext2D, el: ShapeElement, dimmed: boolean) {
  const minX = Math.min(el.x1, el.x2)
  const minY = Math.min(el.y1, el.y2)
  const w = Math.abs(el.x2 - el.x1)
  const h = Math.abs(el.y2 - el.y1)
  if (w < 1 && h < 1) return

  ctx.save()
  if (dimmed) ctx.globalAlpha = 0.22
  ctx.strokeStyle = el.color
  ctx.lineWidth = el.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  if (el.shapeKind === 'rectangle') {
    const radius = Math.min(12, w * 0.2, h * 0.2)
    ctx.roundRect(minX, minY, w, h, radius)
  } else if (el.shapeKind === 'diamond') {
    const cx = minX + w / 2
    const cy = minY + h / 2
    ctx.moveTo(cx, minY)
    ctx.lineTo(minX + w, cy)
    ctx.lineTo(cx, minY + h)
    ctx.lineTo(minX, cy)
    ctx.closePath()
  } else if (el.shapeKind === 'ellipse') {
    ctx.ellipse(minX + w / 2, minY + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  }
  ctx.stroke()
  ctx.restore()
}

function renderConnector(ctx: CanvasRenderingContext2D, el: ConnectorElement, dimmed: boolean) {
  const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1)
  if (len < 1.5) return

  ctx.save()
  if (dimmed) ctx.globalAlpha = 0.22
  ctx.strokeStyle = el.color
  ctx.lineWidth = el.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  ctx.moveTo(el.x1, el.y1)
  ctx.lineTo(el.x2, el.y2)

  if (el.connectorKind === 'arrow' && len > 4) {
    const [wingA, wingB] = getArrowheadPoints(el)
    ctx.moveTo(wingA.x, wingA.y)
    ctx.lineTo(el.x2, el.y2)
    ctx.lineTo(wingB.x, wingB.y)
  }

  ctx.stroke()
  ctx.restore()
}

function renderText(ctx: CanvasRenderingContext2D, el: TextElement, dimmed: boolean) {
  if (!el.text.trim()) return
  ctx.save()
  if (dimmed) ctx.globalAlpha = 0.22
  ctx.fillStyle = el.color
  ctx.font = `500 ${el.fontSize}px 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
  ctx.textBaseline = 'top'

  const lines = el.text.split('\n')
  const lineHeight = el.fontSize * 1.32
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], el.x, el.y + i * lineHeight)
  }
  ctx.restore()
}

function renderSingleElement(
  ctx: CanvasRenderingContext2D,
  el: WhiteboardElement,
  dimmed: boolean,
) {
  switch (el.type) {
    case 'pen':
    case 'highlighter':
      renderFreehand(ctx, el, dimmed)
      break
    case 'shape':
      renderShape(ctx, el, dimmed)
      break
    case 'connector':
      renderConnector(ctx, el, dimmed)
      break
    case 'text':
      renderText(ctx, el, dimmed)
      break
  }
}

export interface RenderSceneOptions {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  dpr: number
  camera: Camera
  elements: WhiteboardElement[]
  draftElement: WhiteboardElement | null
  erasedIds?: ReadonlySet<string>
  editingTextId?: string | null
}

/**
 * Renders the full whiteboard scene onto a pure white background.
 * Highlighter strokes are rendered beneath crisp ink strokes, shapes, and text
 * so equations and diagram labels stay sharp and legible.
 */
export function renderScene({
  ctx,
  width,
  height,
  dpr,
  camera,
  elements,
  draftElement,
  erasedIds,
  editingTextId,
}: RenderSceneOptions): void {
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Pure white whiteboard paper
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // Apply viewport camera transform
  ctx.translate(camera.x, camera.y)
  ctx.scale(camera.scale, camera.scale)

  // Pass 1: Highlighter strokes (underlay)
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (el.type !== 'highlighter') continue
    renderSingleElement(ctx, el, Boolean(erasedIds?.has(el.id)))
  }
  if (draftElement && draftElement.type === 'highlighter') {
    renderSingleElement(ctx, draftElement, false)
  }

  // Pass 2: Pen strokes, shapes, connectors, and text
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (el.type === 'highlighter') continue
    if (editingTextId && el.id === editingTextId) continue
    renderSingleElement(ctx, el, Boolean(erasedIds?.has(el.id)))
  }
  if (draftElement && draftElement.type !== 'highlighter') {
    renderSingleElement(ctx, draftElement, false)
  }

  ctx.restore()
}

function dataUrlToBlobSync(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(',')
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: 'image/png' })
}

export interface RenderedPngSnapshot {
  blob: Blob
  dataUrl: string
  filename: string
}

function buildSnapshotFilename(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `sketch-${stamp}.png`
}

/**
 * Synchronously renders the current screen view to both a PNG Blob and Data URL.
 * Keeping this 100% synchronous ensures transient user activation (`navigator.userActivation`)
 * is never lost before calling `navigator.clipboard.write` or `navigator.share` on mobile devices,
 * and caps the longest pixel edge so Android system clipboard buffers never overflow.
 */
export function renderScreenToPngSync(
  width: number,
  height: number,
  camera: Camera,
  elements: WhiteboardElement[],
  maxLongestEdge = 1600,
): RenderedPngSnapshot {
  const rawDpr = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2)
  const longestCssEdge = Math.max(width, height, 1)
  const exportDpr = Math.min(rawDpr, maxLongestEdge / longestCssEdge)

  const offscreen = document.createElement('canvas')
  offscreen.width = Math.max(1, Math.round(width * exportDpr))
  offscreen.height = Math.max(1, Math.round(height * exportDpr))

  const ctx = offscreen.getContext('2d')
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context')
  }

  renderScene({
    ctx,
    width,
    height,
    dpr: exportDpr,
    camera,
    elements,
    draftElement: null,
  })

  const dataUrl = offscreen.toDataURL('image/png')
  const blob = dataUrlToBlobSync(dataUrl)
  return {
    blob,
    dataUrl,
    filename: buildSnapshotFilename(),
  }
}

export function canShareImageFiles(): boolean {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function' ||
    typeof navigator.canShare !== 'function' ||
    typeof File === 'undefined'
  ) {
    return false
  }
  try {
    const probe = new File([new Uint8Array(1)], 'sketch.png', { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

export async function shareSnapshotImage(snapshot: RenderedPngSnapshot): Promise<boolean> {
  if (!canShareImageFiles()) return false
  const file = new File([snapshot.blob], snapshot.filename, { type: 'image/png' })
  try {
    await navigator.share({
      files: [file],
      title: 'Sketch',
    })
    return true
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // User dismissed the native share sheet after opening it
      return true
    }
    throw err
  }
}

function copyImageViaDomSelection(dataUrl: string): boolean {
  if (typeof document === 'undefined') return false
  const container = document.createElement('div')
  container.contentEditable = 'true'
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.opacity = '0'
  container.style.userSelect = 'auto'
  container.style.webkitUserSelect = 'auto'

  const img = document.createElement('img')
  img.src = dataUrl
  container.appendChild(img)
  document.body.appendChild(container)

  let copied = false
  try {
    const range = document.createRange()
    range.selectNode(img)
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(range)
      copied = document.execCommand('copy')
      selection.removeAllRanges()
    }
  } catch {
    copied = false
  } finally {
    document.body.removeChild(container)
  }
  return copied
}

/**
 * Copies a pre-rendered PNG snapshot directly to the system clipboard.
 * Uses a synchronously-created concrete Blob so both Android Chromium and iOS WebKit
 * execute `navigator.clipboard.write` within the active user gesture, with a DOM
 * selection fallback for Android WebViews.
 */
export async function writeSnapshotToClipboard(
  snapshot: RenderedPngSnapshot,
): Promise<void> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard?.write &&
    typeof ClipboardItem !== 'undefined'
  ) {
    try {
      const item = new ClipboardItem({ 'image/png': snapshot.blob })
      await navigator.clipboard.write([item])
      return
    } catch (err) {
      if (copyImageViaDomSelection(snapshot.dataUrl)) {
        return
      }
      throw err
    }
  }

  if (copyImageViaDomSelection(snapshot.dataUrl)) {
    return
  }

  throw new Error('Image clipboard is not supported in this browser')
}

/**
 * Exports the current screen image at high resolution on a crisp white background
 * and triggers an immediate file download.
 */
export async function downloadCurrentScreenImage(
  width: number,
  height: number,
  camera: Camera,
  elements: WhiteboardElement[],
): Promise<void> {
  const snapshot = renderScreenToPngSync(width, height, camera, elements, 2560)
  const url = URL.createObjectURL(snapshot.blob)
  const link = document.createElement('a')
  link.download = snapshot.filename
  link.href = url
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
