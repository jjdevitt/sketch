import {
  Circle,
  Diamond,
  Eraser,
  Highlighter,
  Minus,
  MoveUpRight,
  Pencil,
  Square,
  Type,
} from 'lucide-react'
import {
  INK_COLORS,
  STROKE_SIZES,
  type ConnectorKind,
  type ShapeKind,
  type StrokeSizeKey,
  type ToolType,
} from '../types/whiteboard'

interface ToolDockProps {
  activeTool: ToolType
  shapeKind: ShapeKind
  connectorKind: ConnectorKind
  activeColor: string
  strokeSize: StrokeSizeKey
  isStyleOpen: boolean
  onSelectTool: (tool: ToolType) => void
  onSelectShapeKind: (kind: ShapeKind) => void
  onSelectConnectorKind: (kind: ConnectorKind) => void
  onSelectColor: (color: string) => void
  onSelectStrokeSize: (size: StrokeSizeKey) => void
  onToggleStyle: () => void
}

export function ToolDock({
  activeTool,
  shapeKind,
  connectorKind,
  activeColor,
  strokeSize,
  isStyleOpen,
  onSelectTool,
  onSelectShapeKind,
  onSelectConnectorKind,
  onSelectColor,
  onSelectStrokeSize,
  onToggleStyle,
}: ToolDockProps) {
  const ShapeIcon =
    shapeKind === 'diamond' ? Diamond : shapeKind === 'ellipse' ? Circle : Square
  const ConnectorIcon = connectorKind === 'line' ? Minus : MoveUpRight

  const dotPx = STROKE_SIZES[strokeSize].dotPx

  return (
    <nav className="bottom-dock-container" aria-label="Drawing tools">
      {isStyleOpen && (
        <div
          id="style-popover"
          className="style-popover"
          role="dialog"
          aria-label="Stroke style options"
        >
          {activeTool === 'shape' && (
            <div className="segmented-group" role="group" aria-label="Flowchart shape">
              <button
                id="btn-shape-rectangle"
                type="button"
                className={`segment-btn ${shapeKind === 'rectangle' ? 'is-selected' : ''}`}
                onClick={() => onSelectShapeKind('rectangle')}
              >
                <Square size={14} strokeWidth={2.2} />
                <span>Box</span>
              </button>
              <button
                id="btn-shape-diamond"
                type="button"
                className={`segment-btn ${shapeKind === 'diamond' ? 'is-selected' : ''}`}
                onClick={() => onSelectShapeKind('diamond')}
              >
                <Diamond size={14} strokeWidth={2.2} />
                <span>Diamond</span>
              </button>
              <button
                id="btn-shape-ellipse"
                type="button"
                className={`segment-btn ${shapeKind === 'ellipse' ? 'is-selected' : ''}`}
                onClick={() => onSelectShapeKind('ellipse')}
              >
                <Circle size={14} strokeWidth={2.2} />
                <span>Circle</span>
              </button>
            </div>
          )}

          {activeTool === 'arrow' && (
            <div className="segmented-group" role="group" aria-label="Connector style">
              <button
                id="btn-connector-arrow"
                type="button"
                className={`segment-btn ${connectorKind === 'arrow' ? 'is-selected' : ''}`}
                onClick={() => onSelectConnectorKind('arrow')}
              >
                <MoveUpRight size={14} strokeWidth={2.2} />
                <span>Arrow</span>
              </button>
              <button
                id="btn-connector-line"
                type="button"
                className={`segment-btn ${connectorKind === 'line' ? 'is-selected' : ''}`}
                onClick={() => onSelectConnectorKind('line')}
              >
                <Minus size={14} strokeWidth={2.2} />
                <span>Line</span>
              </button>
            </div>
          )}

          <div className="popover-row">
            <div className="color-grid" role="radiogroup" aria-label="Ink color">
              {INK_COLORS.map((c) => {
                const selected = activeColor.toLowerCase() === c.value.toLowerCase()
                return (
                  <button
                    key={c.id}
                    id={`btn-color-${c.id}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={c.label}
                    title={c.label}
                    className={`color-swatch-btn ${selected ? 'is-selected' : ''}`}
                    onClick={() => onSelectColor(c.value)}
                  >
                    <span
                      className="color-swatch-fill"
                      style={{ backgroundColor: c.value }}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="segmented-group" role="radiogroup" aria-label="Stroke thickness">
            {(Object.keys(STROKE_SIZES) as StrokeSizeKey[]).map((key) => {
              const item = STROKE_SIZES[key]
              const selected = strokeSize === key
              const barHeight = key === 'fine' ? 2 : key === 'medium' ? 3.5 : 5.5
              return (
                <button
                  key={key}
                  id={`btn-size-${key}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`segment-btn ${selected ? 'is-selected' : ''}`}
                  onClick={() => onSelectStrokeSize(key)}
                >
                  <span
                    className="stroke-preview-line"
                    style={{ height: `${barHeight}px` }}
                  />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="tool-dock" role="toolbar" aria-label="Primary drawing tools">
        <button
          id="btn-tool-pen"
          type="button"
          className={`tool-btn ${activeTool === 'pen' ? 'is-active' : ''}`}
          onClick={() => onSelectTool('pen')}
          aria-pressed={activeTool === 'pen'}
          aria-label="Pen"
          title="Pen (P)"
        >
          <Pencil size={19} strokeWidth={2.1} />
        </button>

        <button
          id="btn-tool-highlighter"
          type="button"
          className={`tool-btn ${activeTool === 'highlighter' ? 'is-active' : ''}`}
          onClick={() => onSelectTool('highlighter')}
          aria-pressed={activeTool === 'highlighter'}
          aria-label="Highlighter"
          title="Highlighter (H)"
        >
          <Highlighter size={19} strokeWidth={2.1} />
        </button>

        <button
          id="btn-tool-arrow"
          type="button"
          className={`tool-btn ${activeTool === 'arrow' ? 'is-active' : ''}`}
          onClick={() => onSelectTool('arrow')}
          aria-pressed={activeTool === 'arrow'}
          aria-label={connectorKind === 'arrow' ? 'Arrow connector' : 'Line connector'}
          title="Arrow / Line (A — tap again for options)"
        >
          <ConnectorIcon size={19} strokeWidth={2.1} />
          <span className="tool-sub-indicator" aria-hidden="true" />
        </button>

        <button
          id="btn-tool-shape"
          type="button"
          className={`tool-btn ${activeTool === 'shape' ? 'is-active' : ''}`}
          onClick={() => onSelectTool('shape')}
          aria-pressed={activeTool === 'shape'}
          aria-label={`Flowchart shape (${shapeKind})`}
          title="Flowchart Shape (S — tap again for Box, Diamond, Circle)"
        >
          <ShapeIcon size={18} strokeWidth={2.1} />
          <span className="tool-sub-indicator" aria-hidden="true" />
        </button>

        <button
          id="btn-tool-text"
          type="button"
          className={`tool-btn ${activeTool === 'text' ? 'is-active' : ''}`}
          onClick={() => onSelectTool('text')}
          aria-pressed={activeTool === 'text'}
          aria-label="Text label"
          title="Text (T)"
        >
          <Type size={19} strokeWidth={2.1} />
        </button>

        <button
          id="btn-tool-eraser"
          type="button"
          className={`tool-btn ${activeTool === 'eraser' ? 'is-active' : ''}`}
          onClick={() => onSelectTool('eraser')}
          aria-pressed={activeTool === 'eraser'}
          aria-label="Eraser"
          title="Eraser (E)"
        >
          <Eraser size={19} strokeWidth={2.1} />
        </button>

        <div className="pill-divider" aria-hidden="true" />

        <button
          id="btn-style-trigger"
          type="button"
          className={`style-trigger-btn ${isStyleOpen ? 'is-open' : ''}`}
          onClick={onToggleStyle}
          aria-expanded={isStyleOpen}
          aria-label="Ink color and stroke thickness"
          title="Color & stroke thickness"
        >
          <span className="style-swatch-ring">
            <span
              className="style-swatch-dot"
              style={{
                width: `${dotPx}px`,
                height: `${dotPx}px`,
                backgroundColor: activeColor,
              }}
            />
          </span>
        </button>
      </div>
    </nav>
  )
}
