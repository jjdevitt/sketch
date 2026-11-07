import { Share2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ToolDock } from './components/ToolDock'
import { TopBar } from './components/TopBar'
import { WhiteboardCanvas } from './components/WhiteboardCanvas'
import type {
  Camera,
  ConnectorKind,
  ShapeKind,
  StrokeSizeKey,
  ToolType,
  WhiteboardElement,
} from './types/whiteboard'
import {
  canShareImageFiles,
  downloadCurrentScreenImage,
  renderScreenToPngSync,
  shareSnapshotImage,
  writeSnapshotToClipboard,
  type RenderedPngSnapshot,
} from './utils/renderer'

interface HistoryState {
  past: WhiteboardElement[][]
  present: WhiteboardElement[]
  future: WhiteboardElement[][]
}

type ToastState =
  | { kind: 'cleared' }
  | { kind: 'copied'; snapshot: RenderedPngSnapshot }
  | { kind: 'message'; text: string }
  | null

const MAX_HISTORY = 100

export function App() {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: [],
    future: [],
  })

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 })
  const [activeTool, setActiveTool] = useState<ToolType>('pen')
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rectangle')
  const [connectorKind, setConnectorKind] = useState<ConnectorKind>('arrow')
  const [inkColor, setInkColor] = useState<string>('#18181b')
  const [highlighterColor, setHighlighterColor] = useState<string>('#eab308')
  const [strokeSize, setStrokeSize] = useState<StrokeSizeKey>('medium')
  const [isStyleOpen, setIsStyleOpen] = useState(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [justCopied, setJustCopied] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const [fallbackSnapshot, setFallbackSnapshot] = useState<RenderedPngSnapshot | null>(
    null,
  )

  const viewportSizeRef = useRef({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  })
  const copyTimerRef = useRef<number | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const activeColor = activeTool === 'highlighter' ? highlighterColor : inkColor
  const supportsFileShare = canShareImageFiles()

  const showToast = useCallback((nextToast: ToastState, durationMs: number) => {
    setToast(nextToast)
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }
    if (nextToast) {
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null)
      }, durationMs)
    }
  }, [])

  const handleViewportResize = useCallback((size: { width: number; height: number }) => {
    viewportSizeRef.current = size
  }, [])

  const commitElements = useCallback((nextElements: WhiteboardElement[]) => {
    setToast((prev) => (prev?.kind === 'cleared' ? null : prev))
    setHistory((prev) => ({
      past: [...prev.past.slice(-(MAX_HISTORY - 1)), prev.present],
      present: nextElements,
      future: [],
    }))
  }, [])

  const handleUndo = useCallback(() => {
    setToast((prev) => (prev?.kind === 'cleared' ? null : prev))
    setHistory((prev) => {
      if (prev.past.length === 0) return prev
      const previous = prev.past[prev.past.length - 1]
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future],
      }
    })
  }, [])

  const handleRedo = useCallback(() => {
    setToast((prev) => (prev?.kind === 'cleared' ? null : prev))
    setHistory((prev) => {
      if (prev.future.length === 0) return prev
      const [next, ...remainingFuture] = prev.future
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: remainingFuture,
      }
    })
  }, [])

  const handleClear = useCallback(() => {
    setIsStyleOpen(false)
    setHistory((prev) => {
      if (prev.present.length === 0) return prev
      return {
        past: [...prev.past.slice(-(MAX_HISTORY - 1)), prev.present],
        present: [],
        future: [],
      }
    })
    showToast({ kind: 'cleared' }, 3400)
  }, [showToast])

  const handleCopy = useCallback(async () => {
    setIsStyleOpen(false)
    const { width, height } = viewportSizeRef.current

    let snapshot: RenderedPngSnapshot
    try {
      snapshot = renderScreenToPngSync(width, height, camera, history.present)
    } catch {
      showToast({ kind: 'message', text: 'Could not capture sketch' }, 2400)
      return
    }

    try {
      await writeSnapshotToClipboard(snapshot)
      setJustCopied(true)
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => {
        setJustCopied(false)
      }, 2000)
      showToast({ kind: 'copied', snapshot }, 3400)
    } catch {
      // On Android browsers/WebViews that restrict programmatic image clipboard writes,
      // open the interactive Copy / Share preview sheet so the user can either long-press
      // to "Copy image" natively or open the Android system Share/Copy sheet.
      setFallbackSnapshot(snapshot)
    }
  }, [camera, history.present, showToast])

  const handleShareSnapshot = useCallback(
    async (snapshot: RenderedPngSnapshot) => {
      setToast(null)
      try {
        const shared = await shareSnapshotImage(snapshot)
        if (shared) {
          setFallbackSnapshot(null)
        } else {
          setFallbackSnapshot(snapshot)
        }
      } catch {
        setFallbackSnapshot(snapshot)
      }
    },
    [],
  )

  const handleSave = useCallback(async () => {
    setIsStyleOpen(false)
    const { width, height } = viewportSizeRef.current
    await downloadCurrentScreenImage(width, height, camera, history.present)
    setJustSaved(true)
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = window.setTimeout(() => {
      setJustSaved(false)
    }, 2000)
  }, [camera, history.present])

  const handleResetView = useCallback(() => {
    setCamera({ x: 0, y: 0, scale: 1 })
  }, [])

  const handleSelectTool = useCallback(
    (tool: ToolType) => {
      if (tool === activeTool && (tool === 'shape' || tool === 'arrow')) {
        setIsStyleOpen((open) => !open)
        return
      }
      setActiveTool(tool)
      setIsStyleOpen(false)
    },
    [activeTool],
  )

  const handleSelectColor = useCallback(
    (color: string) => {
      if (activeTool === 'highlighter') {
        setHighlighterColor(color)
      } else {
        setInkColor(color)
      }
      if (activeTool === 'eraser') {
        setActiveTool('pen')
      }
    },
    [activeTool],
  )

  const handleDismissOverlays = useCallback(() => {
    setIsStyleOpen(false)
  }, [])

  // Laptop keyboard shortcuts
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void handleSave()
        return
      }

      if (isTypingTarget(e.target)) return

      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        void handleCopy()
        return
      }

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
        return
      }

      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
        return
      }

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        setIsSpacePressed(true)
        return
      }

      if (e.key === 'Escape') {
        setIsStyleOpen(false)
        setFallbackSnapshot(null)
        return
      }

      if (mod || e.altKey) return

      switch (e.key.toLowerCase()) {
        case 'p':
        case '1':
          setActiveTool('pen')
          setIsStyleOpen(false)
          break
        case 'h':
        case '2':
          setActiveTool('highlighter')
          setIsStyleOpen(false)
          break
        case 'a':
        case '3':
          setActiveTool('arrow')
          setIsStyleOpen(false)
          break
        case 's':
        case 'r':
        case '4':
          setActiveTool('shape')
          setIsStyleOpen(false)
          break
        case 't':
        case '5':
          setActiveTool('text')
          setIsStyleOpen(false)
          break
        case 'e':
        case '6':
          setActiveTool('eraser')
          setIsStyleOpen(false)
          break
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false)
      }
    }

    const handleWindowBlur = () => {
      setIsSpacePressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [handleCopy, handleRedo, handleSave, handleUndo])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  return (
    <main className="whiteboard-app">
      <TopBar
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        isEmpty={history.present.length === 0}
        justCopied={justCopied}
        justSaved={justSaved}
        camera={camera}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
        onCopy={() => void handleCopy()}
        onSave={() => void handleSave()}
        onResetView={handleResetView}
      />

      {toast && (
        <div className="toast-banner" role="status" aria-live="polite">
          <span>
            {toast.kind === 'cleared'
              ? 'Canvas cleared'
              : toast.kind === 'copied'
                ? 'Copied sketch to clipboard'
                : toast.text}
          </span>
          {toast.kind === 'cleared' && (
            <button
              id="btn-toast-undo"
              type="button"
              className="toast-action-btn"
              onClick={handleUndo}
            >
              Undo
            </button>
          )}
          {toast.kind === 'copied' && supportsFileShare && (
            <button
              id="btn-toast-share"
              type="button"
              className="toast-action-btn"
              onClick={() => void handleShareSnapshot(toast.snapshot)}
            >
              Share
            </button>
          )}
        </div>
      )}

      {fallbackSnapshot && (
        <div
          className="snapshot-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="snapshot-modal-title"
          onClick={() => setFallbackSnapshot(null)}
        >
          <div
            className="snapshot-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="snapshot-modal-header">
              <h2 id="snapshot-modal-title" className="snapshot-modal-title">
                Copy or Share Sketch
              </h2>
              <button
                id="btn-close-snapshot-modal"
                type="button"
                className="icon-btn"
                onClick={() => setFallbackSnapshot(null)}
                aria-label="Close preview"
              >
                <X size={18} strokeWidth={2.1} />
              </button>
            </div>

            <p className="snapshot-modal-hint">
              Touch and hold the image below to choose <strong>Copy image</strong>, or use
              your device share menu.
            </p>

            <div className="snapshot-preview-frame">
              <img
                src={fallbackSnapshot.dataUrl}
                alt="Sketch preview"
                className="snapshot-preview-img"
              />
            </div>

            {supportsFileShare && (
              <div className="snapshot-modal-actions">
                <button
                  id="btn-share-snapshot"
                  type="button"
                  className="snapshot-primary-btn"
                  onClick={() => void handleShareSnapshot(fallbackSnapshot)}
                >
                  <Share2 size={16} strokeWidth={2.1} />
                  <span>Share / Copy Image</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <WhiteboardCanvas
        elements={history.present}
        camera={camera}
        activeTool={activeTool}
        shapeKind={shapeKind}
        connectorKind={connectorKind}
        activeColor={activeColor}
        strokeSize={strokeSize}
        isSpacePressed={isSpacePressed}
        onCommitElements={commitElements}
        onCameraChange={setCamera}
        onDismissOverlays={handleDismissOverlays}
        onViewportResize={handleViewportResize}
      />

      <ToolDock
        activeTool={activeTool}
        shapeKind={shapeKind}
        connectorKind={connectorKind}
        activeColor={activeColor}
        strokeSize={strokeSize}
        isStyleOpen={isStyleOpen}
        onSelectTool={handleSelectTool}
        onSelectShapeKind={(kind) => {
          setShapeKind(kind)
          setIsStyleOpen(false)
        }}
        onSelectConnectorKind={(kind) => {
          setConnectorKind(kind)
          setIsStyleOpen(false)
        }}
        onSelectColor={handleSelectColor}
        onSelectStrokeSize={setStrokeSize}
        onToggleStyle={() => setIsStyleOpen((open) => !open)}
      />
    </main>
  )
}

export default App
