import type {
  Camera,
  ConnectorElement,
  Point,
  TextElement,
  WhiteboardElement,
} from '../types/whiteboard'

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export function screenToWorld(screenX: number, screenY: number, camera: Camera): Point {
  return {
    x: (screenX - camera.x) / camera.scale,
    y: (screenY - camera.y) / camera.scale,
  }
}

export function worldToScreen(worldX: number, worldY: number, camera: Camera): Point {
  return {
    x: worldX * camera.scale + camera.x,
    y: worldY * camera.scale + camera.y,
  }
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y)
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.hypot(p.x - projX, p.y - projY)
}

/**
 * Gently snaps horizontal/vertical flowchart connectors on touch,
 * or snaps to 15-degree increments when Shift is held on laptop.
 */
export function snapConnectorEndpoint(
  start: Point,
  end: Point,
  shiftKey: boolean,
): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length < 8) return end

  const angle = Math.atan2(dy, dx)

  if (shiftKey) {
    const step = Math.PI / 12 // 15 degrees
    const snappedAngle = Math.round(angle / step) * step
    return {
      x: start.x + Math.cos(snappedAngle) * length,
      y: start.y + Math.sin(snappedAngle) * length,
    }
  }

  // Gentle 3-degree magnetic snap to pure horizontal or vertical for clean mobile flowcharts
  if (length > 36) {
    const threshold = (3 * Math.PI) / 180
    if (Math.abs(angle) < threshold || Math.abs(Math.abs(angle) - Math.PI) < threshold) {
      return { x: end.x, y: start.y }
    }
    if (Math.abs(Math.abs(angle) - Math.PI / 2) < threshold) {
      return { x: start.x, y: end.y }
    }
  }

  return end
}

/**
 * Constrains shape aspect ratio to 1:1 when Shift is held.
 */
export function constrainShapeEndpoint(
  start: Point,
  end: Point,
  shiftKey: boolean,
): Point {
  if (!shiftKey) return end
  const dx = end.x - start.x
  const dy = end.y - start.y
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    x: start.x + Math.sign(dx || 1) * size,
    y: start.y + Math.sign(dy || 1) * size,
  }
}

export function getArrowheadPoints(
  el: Pick<ConnectorElement, 'x1' | 'y1' | 'x2' | 'y2' | 'strokeWidth'>,
): [Point, Point] {
  const dx = el.x2 - el.x1
  const dy = el.y2 - el.y1
  const len = Math.hypot(dx, dy)
  const headLen = Math.min(Math.max(el.strokeWidth * 3.8, 12), Math.max(len * 0.42, 8))
  const angle = Math.atan2(dy, dx)
  const spread = Math.PI / 6.2 // ~29 degrees

  return [
    {
      x: el.x2 - headLen * Math.cos(angle - spread),
      y: el.y2 - headLen * Math.sin(angle - spread),
    },
    {
      x: el.x2 - headLen * Math.cos(angle + spread),
      y: el.y2 - headLen * Math.sin(angle + spread),
    },
  ]
}

export function estimateTextBounds(el: TextElement): {
  x: number
  y: number
  width: number
  height: number
} {
  const lines = el.text.split('\n')
  const lineHeight = el.fontSize * 1.32
  const maxChars = lines.reduce((max, line) => Math.max(max, line.length), 1)
  const width = Math.max(maxChars * el.fontSize * 0.58, el.fontSize)
  const height = Math.max(lines.length * lineHeight, lineHeight)
  return {
    x: el.x,
    y: el.y,
    width,
    height,
  }
}

export function findTextElementAtPoint(
  elements: WhiteboardElement[],
  point: Point,
  padding = 8,
): TextElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]
    if (el.type !== 'text') continue
    const bounds = estimateTextBounds(el)
    if (
      point.x >= bounds.x - padding &&
      point.x <= bounds.x + bounds.width + padding &&
      point.y >= bounds.y - padding &&
      point.y <= bounds.y + bounds.height + padding
    ) {
      return el
    }
  }
  return null
}

/**
 * Accurate hit-testing for the stroke/object eraser across all element types.
 */
export function isElementHitByCircle(
  el: WhiteboardElement,
  center: Point,
  radius: number,
): boolean {
  if (el.type === 'pen' || el.type === 'highlighter') {
    const strokeMargin =
      el.type === 'highlighter' ? el.strokeWidth * 1.7 : el.strokeWidth * 0.55
    const threshold = radius + strokeMargin
    const pts = el.points
    if (pts.length === 0) return false
    if (pts.length === 1) {
      return Math.hypot(center.x - pts[0].x, center.y - pts[0].y) <= threshold
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(center, pts[i], pts[i + 1]) <= threshold) {
        return true
      }
    }
    return false
  }

  if (el.type === 'connector') {
    const threshold = radius + el.strokeWidth * 0.75 + 2
    const start = { x: el.x1, y: el.y1 }
    const end = { x: el.x2, y: el.y2 }
    if (distToSegment(center, start, end) <= threshold) return true

    if (el.connectorKind === 'arrow') {
      const [wingA, wingB] = getArrowheadPoints(el)
      if (distToSegment(center, wingA, end) <= threshold) return true
      if (distToSegment(center, wingB, end) <= threshold) return true
    }
    return false
  }

  if (el.type === 'shape') {
    const threshold = radius + el.strokeWidth * 0.75 + 2
    const minX = Math.min(el.x1, el.x2)
    const maxX = Math.max(el.x1, el.x2)
    const minY = Math.min(el.y1, el.y2)
    const maxY = Math.max(el.y1, el.y2)

    // Quick bounding-box reject
    if (
      center.x < minX - threshold ||
      center.x > maxX + threshold ||
      center.y < minY - threshold ||
      center.y > maxY + threshold
    ) {
      return false
    }

    if (el.shapeKind === 'rectangle') {
      const tl = { x: minX, y: minY }
      const tr = { x: maxX, y: minY }
      const br = { x: maxX, y: maxY }
      const bl = { x: minX, y: maxY }
      return (
        distToSegment(center, tl, tr) <= threshold ||
        distToSegment(center, tr, br) <= threshold ||
        distToSegment(center, br, bl) <= threshold ||
        distToSegment(center, bl, tl) <= threshold
      )
    }

    if (el.shapeKind === 'diamond') {
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const top = { x: cx, y: minY }
      const right = { x: maxX, y: cy }
      const bottom = { x: cx, y: maxY }
      const left = { x: minX, y: cy }
      return (
        distToSegment(center, top, right) <= threshold ||
        distToSegment(center, right, bottom) <= threshold ||
        distToSegment(center, bottom, left) <= threshold ||
        distToSegment(center, left, top) <= threshold
      )
    }

    if (el.shapeKind === 'ellipse') {
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const rx = (maxX - minX) / 2
      const ry = (maxY - minY) / 2
      if (rx < 1 && ry < 1) {
        return Math.hypot(center.x - cx, center.y - cy) <= threshold
      }
      const steps = 32
      let prev: Point = { x: cx + rx, y: cy }
      for (let i = 1; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2
        const curr: Point = {
          x: cx + Math.cos(theta) * rx,
          y: cy + Math.sin(theta) * ry,
        }
        if (distToSegment(center, prev, curr) <= threshold) {
          return true
        }
        prev = curr
      }
      return false
    }
  }

  if (el.type === 'text') {
    const b = estimateTextBounds(el)
    const clampedX = Math.max(b.x, Math.min(center.x, b.x + b.width))
    const clampedY = Math.max(b.y, Math.min(center.y, b.y + b.height))
    return Math.hypot(center.x - clampedX, center.y - clampedY) <= radius + 4
  }

  return false
}
