import { Check, Download, Redo2, Trash2, Undo2 } from 'lucide-react'
import type { Camera } from '../types/whiteboard'

interface TopBarProps {
  canUndo: boolean
  canRedo: boolean
  isEmpty: boolean
  justSaved: boolean
  camera: Camera
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onSave: () => void
  onResetView: () => void
}

export function TopBar({
  canUndo,
  canRedo,
  isEmpty,
  justSaved,
  camera,
  onUndo,
  onRedo,
  onClear,
  onSave,
  onResetView,
}: TopBarProps) {
  const isZoomed = Math.abs(camera.scale - 1) > 0.01
  const isPanned = Math.hypot(camera.x, camera.y) > 64
  const showResetView = isZoomed || isPanned

  return (
    <header className="top-bar">
      <h1 className="sr-only">Sketch Whiteboard</h1>

      <div className="top-group">
        <div className="floating-pill" role="group" aria-label="History controls">
          <button
            id="btn-undo"
            type="button"
            className="icon-btn"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={18} strokeWidth={2.1} />
          </button>
          <button
            id="btn-redo"
            type="button"
            className="icon-btn"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 size={18} strokeWidth={2.1} />
          </button>
        </div>

        {showResetView && (
          <button
            id="btn-reset-view"
            type="button"
            className="zoom-badge"
            onClick={onResetView}
            aria-label="Reset canvas zoom and pan"
            title="Reset view to 100%"
          >
            {isZoomed ? `${Math.round(camera.scale * 100)}%` : 'Center'}
          </button>
        )}
      </div>

      <div className="top-group">
        <div className="floating-pill" role="group" aria-label="Canvas actions">
          <button
            id="btn-clear"
            type="button"
            className="icon-btn btn-clear"
            onClick={onClear}
            disabled={isEmpty}
            aria-label="Clear whiteboard"
            title="Clear canvas"
          >
            <Trash2 size={17} strokeWidth={2.1} />
          </button>

          <div className="pill-divider" aria-hidden="true" />

          <button
            id="btn-save-image"
            type="button"
            className={`icon-btn btn-save ${justSaved ? 'is-saved' : ''}`}
            onClick={onSave}
            aria-label="Save current screen image"
            title="Download current screen as PNG (Ctrl+S)"
          >
            {justSaved ? (
              <Check size={17} strokeWidth={2.4} />
            ) : (
              <Download size={17} strokeWidth={2.1} />
            )}
            <span className="save-label">{justSaved ? 'Saved' : 'Save'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
