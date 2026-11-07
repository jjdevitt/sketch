# Sketch
Sketch is a simple React App with no backend that offers a stateless and quick method of drawing and whiteboarding from mobile devices.

**Live App:** [https://sketch-n30f.onrender.com/](https://sketch-n30f.onrender.com/)

## Features

- **Touch-First Canvas**: Smooth, pressure- and velocity-aware freehand drawing (`perfect-freehand`) tuned for quick math derivations, handwriting, and diagrams on mobile screens as well as laptops.
- **Minimalist Drawing Tools**:
  - **Pen & Highlighter**: Crisp ink strokes with underlay highlighting so equations and labels remain legible.
  - **Flowchart Connectors & Shapes**: Quick arrows, lines, rounded boxes, decision diamonds, and circles with gentle axis alignment.
  - **Inline Text**: Tap anywhere to label flowchart nodes or add notes.
  - **Stroke Eraser**: Swipe across any stroke, shape, connector, or label to remove it cleanly.
  - **Color & Stroke Weight**: Curated whiteboard ink palette with Fine, Medium, and Bold weights.
- **Multi-Touch & Laptop Navigation**: Two-finger pinch-to-zoom and pan on touch devices; trackpad scroll, `Ctrl/Cmd + Scroll` zoom, `Space + Drag` pan, and single-key tool shortcuts on laptops.
- **Undo, Redo & Safe Clear**: Full undo/redo history stack, including one-tap undo after clearing the canvas.
- **Copy to Clipboard & Save Image**: Capture the current sketch directly to the system clipboard as a PNG image (`Copy` button or `Ctrl/Cmd + C`), or export it as a high-DPI `.png` download (`Save` button or `Ctrl/Cmd + S`).

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
