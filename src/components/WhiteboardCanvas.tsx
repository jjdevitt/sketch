import { useCallback, useEffect, useRef, useState } from 'react'
import {
  STROKE_SIZES,
  type Camera,
  type ConnectorKind,
  type Point,
  type ShapeKind,
  type StrokeSizeKey,
  type TextElement,
  type ToolType,
  type WhiteboardElement,
} from '../types/whiteboard'
import {
  constrainShapeEndpoint,
  createId,
  findTextElementAtPoint,
  isElementHitByCircle,
  screenToWorld,
  snapConnectorEndpoint,
  worldToScreen,
} from '../utils/geometry'
import { renderScene } from '../utils/renderer'

interface WhiteboardCanvasProps {
  elements: WhiteboardElement[]
  camera: Camera
  activeTool: ToolType
  shapeKind: ShapeKind
  connectorKind: ConnectorKind
  activeColor: string
  strokeSize: StrokeSizeKey
  isSpacePressed: boolean
  onCommitElements: (nextElements: WhiteboardElement[]) => void
  onCameraChange: (updater: Camera | ((prev: Camera) => Camera)) => void
  onDismissOverlays: () => void
  onViewportResize: (size: { width: number; height: number }) => void
}

interface EditingTextState {
  id: string
  x: number
  y: number
  text: string
  color: string
  fontSize: number
  isExisting: boolean
}

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const ERASER_SCREEN_RADIUS = 16

export function WhiteboardCanvas({
  elements,
  camera,
  activeTool,
  shapeKind,
  connectorKind,
  activeColor,
  strokeSize,
  isSpacePressed,
  onCommitElements,
  onCameraChange,
  onDismissOverlays,
  onViewportResize,
}: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  }))

  const [draftElement, setDraftElement] = useState<WhiteboardElement | null>(null)
  const [erasedIds, setErasedIds] = useState<Set<string>>(() => new Set())
  const [eraserScreenPos, setEraserScreenPos] = useState<Point | null>(null)
  const [editingText, setEditingText] = useState<EditingTextState | null>(null)
  const [isPanningDrag, setIsPanningDrag] = useState(false)

  // Mutable refs for high-frequency pointer handling without stale closures
  const activePointersRef = useRef<Map<number, Point>>(new Map())
  const primaryPointerIdRef = useRef<number | null>(null)
  const gestureLockRef = useRef(false)
  const prevPinchRef = useRef<{ mid: Point; dist: number } | null>(null)
  const panLastRef = useRef<Point | null>(null)
  const pointerDownScreenRef = useRef<Point | null>(null)
  const maxTravelPxRef = useRef(0)
  const draftRef = useRef<WhiteboardElement | null>(null)
  const erasedIdsRef = useRef<Set<string>>(new Set())
  const editingTextRef = useRef<EditingTextState | null>(null)

  useEffect(() => {
    editingTextRef.current = editingText
  }, [editingText])

  // Keep canvas backing buffer crisp across window resizes and mobile orientation changes
  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const dpr = window.devicePixelRatio || 1
      setViewport({ width, height, dpr })
      onViewportResize({ width, height })
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    window.visualViewport?.addEventListener('resize', updateSize)
    return () => {
      window.removeEventListener('resize', updateSize)
      window.visualViewport?.removeEventListener('resize', updateSize)
    }
  }, [onViewportResize])

  // Render scene whenever state or viewport updates
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const targetW = Math.round(viewport.width * viewport.dpr)
    const targetH = Math.round(viewport.height * viewport.dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    renderScene({
      ctx,
      width: viewport.width,
      height: viewport.height,
      dpr: viewport.dpr,
      camera,
      elements,
      draftElement,
      erasedIds,
      editingTextId: editingText?.isExisting ? editingText.id : null,
    })
  }, [viewport, camera, elements, draftElement, erasedIds, editingText])

  const commitActiveText = useCallback(() => {
    const current = editingTextRef.current
    if (!current) return
    editingTextRef.current = null
    setEditingText(null)

    const trimmed = current.text.trim()
    if (!trimmed) {
      if (current.isExisting) {
        onCommitElements(elements.filter((el) => el.id !== current.id))
      }
      return
    }

    const updatedTextEl: TextElement = {
      id: current.id,
      type: 'text',
      x: current.x,
      y: current.y,
      text: current.text.replace(/\s+$/, ''),
      color: current.color,
      fontSize: current.fontSize,
    }

    if (current.isExisting) {
      const existing = elements.find((el) => el.id === current.id)
      if (
        existing &&
        existing.type === 'text' &&
        existing.text === updatedTextEl.text &&
        existing.color === updatedTextEl.color &&
        existing.fontSize === updatedTextEl.fontSize
      ) {
        return
      }
      onCommitElements(
        elements.map((el) => (el.id === current.id ? updatedTextEl : el)),
      )
    } else {
      onCommitElements([...elements, updatedTextEl])
    }
  }, [elements, onCommitElements])

  // Commit open text editor if user switches away from the text tool
  useEffect(() => {
    if (activeTool !== 'text' && editingTextRef.current) {
      commitActiveText()
    }
  }, [activeTool, commitActiveText])

  const editingTextId = editingText?.id ?? null

  // Focus textarea reliably after opening
  useEffect(() => {
    if (!editingTextId) return
    const frame = requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        const len = el.value.length
        el.setSelectionRange(len, len)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [editingTextId])

  // Laptop trackpad pan & Ctrl/Cmd + wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = Math.exp(-e.deltaY * 0.0045)
        onCameraChange((prev) => {
          const nextScale = Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, prev.scale * zoomFactor),
          )
          const wx = (e.clientX - prev.x) / prev.scale
          const wy = (e.clientY - prev.y) / prev.scale
          return {
            scale: nextScale,
            x: e.clientX - wx * nextScale,
            y: e.clientY - wy * nextScale,
          }
        })
      } else {
        onCameraChange((prev) => ({
          ...prev,
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }))
      }
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [onCameraChange])

  const collectEraserHits = useCallback(
    (worldPt: Point) => {
      const worldRadius = ERASER_SCREEN_RADIUS / camera.scale
      let changed = false
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        if (erasedIdsRef.current.has(el.id)) continue
        if (isElementHitByCircle(el, worldPt, worldRadius)) {
          erasedIdsRef.current.add(el.id)
          changed = true
        }
      }
      if (changed) {
        setErasedIds(new Set(erasedIdsRef.current))
      }
    },
    [camera.scale, elements],
  )

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Ignore non-primary mouse buttons except middle-click for panning
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return

    onDismissOverlays()
    if (editingTextRef.current) {
      commitActiveText()
    }

    e.currentTarget.setPointerCapture(e.pointerId)

    const screenPt: Point = { x: e.clientX, y: e.clientY }
    activePointersRef.current.set(e.pointerId, screenPt)

    // Multi-touch: two fingers trigger smooth pinch-to-zoom & two-finger pan
    if (activePointersRef.current.size >= 2) {
      gestureLockRef.current = true
      primaryPointerIdRef.current = null
      panLastRef.current = null
      setIsPanningDrag(false)

      // Cancel accidental short 1-finger stroke started milliseconds before 2nd finger landed
      if (maxTravelPxRef.current < 22) {
        draftRef.current = null
        setDraftElement(null)
        erasedIdsRef.current = new Set()
        setErasedIds(new Set())
      } else if (draftRef.current) {
        onCommitElements([...elements, draftRef.current])
        draftRef.current = null
        setDraftElement(null)
      }

      const pts = Array.from(activePointersRef.current.values())
      const p1 = pts[0]
      const p2 = pts[1]
      prevPinchRef.current = {
        mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        dist: Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y), 10),
      }
      setEraserScreenPos(null)
      return
    }

    if (gestureLockRef.current) return

    // Spacebar + drag or middle-mouse button pan on laptop
    if (isSpacePressed || (e.pointerType === 'mouse' && e.button === 1)) {
      primaryPointerIdRef.current = e.pointerId
      panLastRef.current = screenPt
      setIsPanningDrag(true)
      return
    }

    primaryPointerIdRef.current = e.pointerId
    pointerDownScreenRef.current = screenPt
    maxTravelPxRef.current = 0

    const worldPt = screenToWorld(e.clientX, e.clientY, camera)
    const sizeSpec = STROKE_SIZES[strokeSize]

    if (activeTool === 'text') {
      // Text editor opens cleanly on pointerUp so touch focus is never stolen
      return
    }

    if (activeTool === 'eraser') {
      erasedIdsRef.current = new Set()
      setErasedIds(new Set())
      setEraserScreenPos(screenPt)
      collectEraserHits(worldPt)
      return
    }

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      const realPressure = e.pointerType === 'pen' && e.pressure > 0
      const nextDraft: WhiteboardElement = {
        id: createId(),
        type: activeTool,
        points: [{ x: worldPt.x, y: worldPt.y, pressure: realPressure ? e.pressure : 0.5 }],
        color: activeColor,
        strokeWidth: sizeSpec.penWidth,
        realPressure,
      }
      draftRef.current = nextDraft
      setDraftElement(nextDraft)
      return
    }

    if (activeTool === 'shape') {
      const nextDraft: WhiteboardElement = {
        id: createId(),
        type: 'shape',
        shapeKind,
        x1: worldPt.x,
        y1: worldPt.y,
        x2: worldPt.x,
        y2: worldPt.y,
        color: activeColor,
        strokeWidth: sizeSpec.shapeWidth,
      }
      draftRef.current = nextDraft
      setDraftElement(nextDraft)
      return
    }

    if (activeTool === 'arrow') {
      const nextDraft: WhiteboardElement = {
        id: createId(),
        type: 'connector',
        connectorKind,
        x1: worldPt.x,
        y1: worldPt.y,
        x2: worldPt.x,
        y2: worldPt.y,
        color: activeColor,
        strokeWidth: sizeSpec.shapeWidth,
      }
      draftRef.current = nextDraft
      setDraftElement(nextDraft)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const screenPt: Point = { x: e.clientX, y: e.clientY }

    if (activeTool === 'eraser' && e.pointerType === 'mouse' && activePointersRef.current.size === 0) {
      setEraserScreenPos(screenPt)
    }

    if (!activePointersRef.current.has(e.pointerId)) return
    activePointersRef.current.set(e.pointerId, screenPt)

    // Two-finger pinch-zoom + pan update
    if (activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values())
      const p1 = pts[0]
      const p2 = pts[1]
      const newMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      const newDist = Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y), 10)
      const prevPinch = prevPinchRef.current

      if (prevPinch) {
        const scaleRatio = newDist / prevPinch.dist
        onCameraChange((prev) => {
          const nextScale = Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, prev.scale * scaleRatio),
          )
          const wx = (prevPinch.mid.x - prev.x) / prev.scale
          const wy = (prevPinch.mid.y - prev.y) / prev.scale
          return {
            scale: nextScale,
            x: newMid.x - wx * nextScale,
            y: newMid.y - wy * nextScale,
          }
        })
      }

      prevPinchRef.current = { mid: newMid, dist: newDist }
      return
    }

    if (gestureLockRef.current || primaryPointerIdRef.current !== e.pointerId) return

    // Single-pointer Spacebar/middle-click pan
    if (panLastRef.current) {
      const dx = screenPt.x - panLastRef.current.x
      const dy = screenPt.y - panLastRef.current.y
      panLastRef.current = screenPt
      onCameraChange((prev) => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy,
      }))
      return
    }

    if (pointerDownScreenRef.current) {
      const dist = Math.hypot(
        screenPt.x - pointerDownScreenRef.current.x,
        screenPt.y - pointerDownScreenRef.current.y,
      )
      if (dist > maxTravelPxRef.current) {
        maxTravelPxRef.current = dist
      }
    }

    if (activeTool === 'eraser') {
      setEraserScreenPos(screenPt)
      const rawCoalesced = e.nativeEvent.getCoalescedEvents?.()
      const coalesced =
        rawCoalesced && rawCoalesced.length > 0 ? rawCoalesced : [e.nativeEvent]
      for (const ev of coalesced) {
        collectEraserHits(screenToWorld(ev.clientX, ev.clientY, camera))
      }
      return
    }

    const currentDraft = draftRef.current
    if (!currentDraft) return

    if (currentDraft.type === 'pen' || currentDraft.type === 'highlighter') {
      const rawCoalesced = e.nativeEvent.getCoalescedEvents?.()
      const coalesced =
        rawCoalesced && rawCoalesced.length > 0 ? rawCoalesced : [e.nativeEvent]
      const appendedPoints = [...currentDraft.points]
      for (const ev of coalesced) {
        const wp = screenToWorld(ev.clientX, ev.clientY, camera)
        const prevPt = appendedPoints[appendedPoints.length - 1]
        if (prevPt && Math.hypot(wp.x - prevPt.x, wp.y - prevPt.y) < 0.6 / camera.scale) {
          continue
        }
        appendedPoints.push({
          x: wp.x,
          y: wp.y,
          pressure: currentDraft.realPressure && ev.pressure > 0 ? ev.pressure : 0.5,
        })
      }
      const updated: WhiteboardElement = {
        ...currentDraft,
        points: appendedPoints,
      }
      draftRef.current = updated
      setDraftElement(updated)
      return
    }

    const worldPt = screenToWorld(e.clientX, e.clientY, camera)

    if (currentDraft.type === 'shape') {
      const constrained = constrainShapeEndpoint(
        { x: currentDraft.x1, y: currentDraft.y1 },
        worldPt,
        e.shiftKey,
      )
      const updated: WhiteboardElement = {
        ...currentDraft,
        x2: constrained.x,
        y2: constrained.y,
      }
      draftRef.current = updated
      setDraftElement(updated)
      return
    }

    if (currentDraft.type === 'connector') {
      const snapped = snapConnectorEndpoint(
        { x: currentDraft.x1, y: currentDraft.y1 },
        worldPt,
        e.shiftKey,
      )
      const updated: WhiteboardElement = {
        ...currentDraft,
        x2: snapped.x,
        y2: snapped.y,
      }
      draftRef.current = updated
      setDraftElement(updated)
    }
  }

  const finishPointer = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    activePointersRef.current.delete(e.pointerId)

    if (activePointersRef.current.size < 2) {
      prevPinchRef.current = null
    }

    if (gestureLockRef.current) {
      if (activePointersRef.current.size === 0) {
        gestureLockRef.current = false
      }
      return
    }

    if (primaryPointerIdRef.current !== e.pointerId) return
    primaryPointerIdRef.current = null

    if (panLastRef.current) {
      panLastRef.current = null
      setIsPanningDrag(false)
      return
    }

    if (activeTool === 'text' && !cancelled && maxTravelPxRef.current < 12) {
      const worldPt = screenToWorld(e.clientX, e.clientY, camera)
      const hitText = findTextElementAtPoint(elements, worldPt)
      const sizeSpec = STROKE_SIZES[strokeSize]

      if (hitText) {
        setEditingText({
          id: hitText.id,
          x: hitText.x,
          y: hitText.y,
          text: hitText.text,
          color: hitText.color,
          fontSize: hitText.fontSize,
          isExisting: true,
        })
      } else {
        setEditingText({
          id: createId(),
          x: worldPt.x,
          y: worldPt.y - sizeSpec.fontSize * 0.5,
          text: '',
          color: activeColor,
          fontSize: sizeSpec.fontSize,
          isExisting: false,
        })
      }
      return
    }

    if (activeTool === 'eraser') {
      if (e.pointerType !== 'mouse') {
        setEraserScreenPos(null)
      }
      if (!cancelled && erasedIdsRef.current.size > 0) {
        const toRemove = erasedIdsRef.current
        onCommitElements(elements.filter((el) => !toRemove.has(el.id)))
      }
      erasedIdsRef.current = new Set()
      setErasedIds(new Set())
      return
    }

    const finishedDraft = draftRef.current
    draftRef.current = null
    setDraftElement(null)

    if (cancelled || !finishedDraft) return

    if (finishedDraft.type === 'shape') {
      const w = Math.abs(finishedDraft.x2 - finishedDraft.x1)
      const h = Math.abs(finishedDraft.y2 - finishedDraft.y1)
      if (w < 4 && h < 4) return
    }

    if (finishedDraft.type === 'connector') {
      const len = Math.hypot(
        finishedDraft.x2 - finishedDraft.x1,
        finishedDraft.y2 - finishedDraft.y1,
      )
      if (len < 6) return
    }

    onCommitElements([...elements, finishedDraft])
  }

  const cursorClass = isPanningDrag
    ? 'cursor-grabbing'
    : isSpacePressed
      ? 'cursor-grab'
      : activeTool === 'text'
        ? 'cursor-text'
        : activeTool === 'eraser'
          ? 'cursor-eraser'
          : 'cursor-crosshair'

  const textScreenPos = editingText
    ? worldToScreen(editingText.x, editingText.y, camera)
    : null

  return (
    <>
      <canvas
        ref={canvasRef}
        id="whiteboard-canvas"
        className={`whiteboard-canvas ${cursorClass}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => finishPointer(e, false)}
        onPointerCancel={(e) => finishPointer(e, true)}
        onPointerLeave={() => {
          if (activeTool === 'eraser' && activePointersRef.current.size === 0) {
            setEraserScreenPos(null)
          }
        }}
      />

      {activeTool === 'eraser' && eraserScreenPos && (
        <div
          className="eraser-cursor"
          style={{
            left: `${eraserScreenPos.x}px`,
            top: `${eraserScreenPos.y}px`,
            width: `${ERASER_SCREEN_RADIUS * 2}px`,
            height: `${ERASER_SCREEN_RADIUS * 2}px`,
          }}
          aria-hidden="true"
        />
      )}

      {editingText && textScreenPos && (
        <div
          className="canvas-text-editor-wrap"
          style={{
            left: `${Math.min(Math.max(8, textScreenPos.x), viewport.width - 104)}px`,
            top: `${Math.min(Math.max(8, textScreenPos.y), viewport.height - 56)}px`,
          }}
        >
          <textarea
            ref={textareaRef}
            id="canvas-text-input"
            className="canvas-text-editor"
            value={editingText.text}
            placeholder="Type..."
            rows={Math.max(1, editingText.text.split('\n').length)}
            style={{
              color: editingText.color,
              fontSize: `${editingText.fontSize * camera.scale}px`,
              width: `${Math.max(
                110,
                (Math.max(
                  ...editingText.text.split('\n').map((l) => l.length),
                  5,
                ) +
                  1.5) *
                  editingText.fontSize *
                  camera.scale *
                  0.62,
              )}px`,
            }}
            onChange={(e) => {
              const nextVal = e.target.value
              setEditingText((prev) => (prev ? { ...prev, text: nextVal } : null))
            }}
            onBlur={() => commitActiveText()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                editingTextRef.current = null
                setEditingText(null)
              } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                commitActiveText()
              }
            }}
          />
        </div>
      )}
    </>
  )
}
