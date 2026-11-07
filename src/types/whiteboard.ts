export type ToolType = 'pen' | 'highlighter' | 'arrow' | 'shape' | 'text' | 'eraser'

export type ShapeKind = 'rectangle' | 'diamond' | 'ellipse'

export type ConnectorKind = 'arrow' | 'line'

export type StrokeSizeKey = 'fine' | 'medium' | 'bold'

export interface Point {
  x: number
  y: number
  pressure?: number
}

export interface FreehandElement {
  id: string
  type: 'pen' | 'highlighter'
  points: Point[]
  color: string
  strokeWidth: number
  realPressure: boolean
}

export interface ShapeElement {
  id: string
  type: 'shape'
  shapeKind: ShapeKind
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  strokeWidth: number
}

export interface ConnectorElement {
  id: string
  type: 'connector'
  connectorKind: ConnectorKind
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  strokeWidth: number
}

export interface TextElement {
  id: string
  type: 'text'
  x: number
  y: number
  text: string
  color: string
  fontSize: number
}

export type WhiteboardElement =
  | FreehandElement
  | ShapeElement
  | ConnectorElement
  | TextElement

export interface Camera {
  x: number
  y: number
  scale: number
}

export interface ColorOption {
  id: string
  label: string
  value: string
}

export const INK_COLORS: ColorOption[] = [
  { id: 'ink', label: 'Charcoal Ink', value: '#18181b' },
  { id: 'blue', label: 'Cobalt Blue', value: '#2563eb' },
  { id: 'red', label: 'Crimson Red', value: '#dc2626' },
  { id: 'green', label: 'Emerald Green', value: '#059669' },
  { id: 'amber', label: 'Warm Amber', value: '#eab308' },
  { id: 'slate', label: 'Cool Slate', value: '#64748b' },
]

export const STROKE_SIZES: Record<
  StrokeSizeKey,
  { label: string; penWidth: number; shapeWidth: number; fontSize: number; dotPx: number }
> = {
  fine: { label: 'Fine', penWidth: 3, shapeWidth: 2, fontSize: 18, dotPx: 6 },
  medium: { label: 'Medium', penWidth: 5.2, shapeWidth: 3, fontSize: 24, dotPx: 10 },
  bold: { label: 'Bold', penWidth: 8.8, shapeWidth: 4.5, fontSize: 32, dotPx: 15 },
}
