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
import { downloadCurrentScreenImage } from './utils/renderer'

interface HistoryState {
  past: WhiteboardElement[][]
  present: WhiteboardElement[]
  future: WhiteboardElement[][]
}

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
  const [justSaved, setJustSaved] = useState(false)
  const [showClearedToast, setShowClearedToast] = useState(false)

  const viewportSizeRef = useRef({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  })
  const saveTimerRef = useRef<number | null>(null)
  const clearToastTimerRef = useRef<number | null>(null)

  const activeColor = activeTool === 'highlighter' ? highlighterColor : inkColor

  const handleViewportResize = useCallback((size: { width: number; height: number }) => {
    viewportSizeRef.current = size
  }, [])

  const commitElements = useCallback((nextElements: WhiteboardElement[]) => {
    setShowClearedToast(false)
    setHistory((prev) => ({
      past: [...prev.past.slice(-(MAX_HISTORY - 1)), prev.present],
      present: nextElements,
      future: [],
    }))
  }, [])

  const handleUndo = useCallback(() => {
    setShowClearedToast(false)
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
    setShowClearedToast(false)
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
    setShowClearedToast(true)
    if (clearToastTimerRef.current) {
      window.clearTimeout(clearToastTimerRef.current)
    }
    clearToastTimerRef.current = window.setTimeout(() => {
      setShowClearedToast(false)
    }, 3400)
  }, [])

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
  }, [handleRedo, handleSave, handleUndo])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      if (clearToastTimerRef.current) window.clearTimeout(clearToastTimerRef.current)
    }
  }, [])

  return (
    <main className="whiteboard-app">
      <TopBar
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        isEmpty={history.present.length === 0}
        justSaved={justSaved}
        camera={camera}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
        onSave={() => void handleSave()}
        onResetView={handleResetView}
      />

      {showClearedToast && (
        <div className="toast-banner" role="status" aria-live="polite">
          <span>Canvas cleared</span>
          <button
            id="btn-toast-undo"
            type="button"
            className="toast-action-btn"
            onClick={handleUndo}
          >
            Undo
          </button>
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
