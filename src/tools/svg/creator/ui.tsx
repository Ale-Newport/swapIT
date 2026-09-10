import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { asToolboxError } from '@/core/bridge';
import { canvasToBytes, saveAs, saveTextAs } from '@/core/save';
import type { BatchResult, ToolboxError } from '@/core/types';
import type { ToolRun } from '@/core/useToolRun';
import { ErrorDisplay, OptionsGrid, ResultPanel, ToolActions, ToolShell } from '@/components/tool';
import {
  Alert,
  Button,
  ColorInput,
  Field,
  Icon,
  IconButton,
  Input,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  Switch,
} from '@/components/ui';
import {
  DEFAULT_DOC,
  DEFAULT_STYLE,
  HANDLES,
  arrowPath,
  boundsOf,
  canResize,
  centerOf,
  createShape,
  describeShape,
  duplicateShape,
  isDegenerate,
  kindLabel,
  moveInList,
  moveShape,
  pathData,
  polyShape,
  resizeBounds,
  rotatePoint,
  round,
  setBounds,
  snapValue,
  toUser,
  type Doc,
  type Handle,
  type LineShape,
  type Point,
  type PolyShape,
  type RectShape,
  type Shape,
  type ShapeKind,
  type Style,
  type TextShape,
} from './logic';

const GRID_SIZE = 10;
const HISTORY_LIMIT = 60;

const TOOLS: Array<{ id: 'select' | ShapeKind; label: string; icon: string }> = [
  { id: 'select', label: 'Select', icon: 'MousePointer2' },
  { id: 'rect', label: 'Rectangle', icon: 'Square' },
  { id: 'circle', label: 'Circle', icon: 'Circle' },
  { id: 'ellipse', label: 'Ellipse', icon: 'Egg' },
  { id: 'line', label: 'Line', icon: 'Minus' },
  { id: 'arrow', label: 'Arrow', icon: 'MoveRight' },
  { id: 'text', label: 'Text', icon: 'Type' },
  { id: 'polygon', label: 'Polygon', icon: 'Pentagon' },
  { id: 'path', label: 'Free path', icon: 'PencilLine' },
];

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  ne: 'nesw-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
};

type Tool = 'select' | ShapeKind;

type Drag =
  | { kind: 'move'; id: string; origin: Point; original: Shape }
  | { kind: 'resize'; id: string; handle: Handle; original: Shape }
  | { kind: 'endpoint'; id: string; which: 1 | 2; original: LineShape }
  | { kind: 'draw'; shape: ShapeKind; from: Point; to: Point };

/** The real, exportable element for a shape. Nothing here is editor chrome. */
function ShapeNode({ shape }: { shape: Shape }) {
  const center = centerOf(shape);
  const transform = shape.rotation ? `rotate(${round(shape.rotation)} ${round(center.x)} ${round(center.y)})` : undefined;
  const paint = {
    fill: shape.fill,
    stroke: shape.stroke,
    strokeWidth: shape.stroke === 'none' ? undefined : shape.strokeWidth,
    opacity: shape.opacity === 1 ? undefined : shape.opacity,
    transform,
  };

  switch (shape.kind) {
    case 'rect':
      return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx || undefined} {...paint} />;
    case 'circle':
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...paint} />;
    case 'ellipse':
      return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...paint} />;
    case 'line':
      return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} strokeLinecap="round" {...paint} />;
    case 'arrow':
      return <path d={arrowPath(shape)} strokeLinecap="round" strokeLinejoin="round" {...paint} />;
    case 'text':
      return (
        <text
          x={shape.x}
          y={shape.y}
          fontFamily={shape.fontFamily}
          fontSize={shape.fontSize}
          fontWeight={shape.fontWeight}
          {...paint}
        >
          {shape.text}
        </text>
      );
    case 'polygon':
      return <polygon points={shape.points.map((p) => `${p.x},${p.y}`).join(' ')} strokeLinejoin="round" {...paint} />;
    case 'path':
      return <path d={pathData(shape.points, false)} strokeLinecap="round" strokeLinejoin="round" {...paint} />;
  }
}

/** An invisible twin in the overlay, so clicks land on shapes without polluting the export. */
function HitProxy({ shape, onDown }: { shape: Shape; onDown: (e: ReactPointerEvent) => void }) {
  const center = centerOf(shape);
  const transform = shape.rotation ? `rotate(${round(shape.rotation)} ${round(center.x)} ${round(center.y)})` : undefined;
  const grab = {
    onPointerDown: onDown,
    style: { cursor: 'move' } as const,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: Math.max(shape.strokeWidth, 14),
    transform,
  };

  switch (shape.kind) {
    case 'rect':
      return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx || undefined} {...grab} />;
    case 'circle':
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...grab} />;
    case 'ellipse':
      return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...grab} />;
    case 'line':
    case 'arrow':
      return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...grab} fill="none" />;
    case 'text': {
      const bounds = boundsOf(shape);
      return <rect x={bounds.x} y={bounds.y} width={Math.max(bounds.width, 4)} height={bounds.height} {...grab} strokeWidth={0} />;
    }
    case 'polygon':
      return <polygon points={shape.points.map((p) => `${p.x},${p.y}`).join(' ')} {...grab} />;
    case 'path':
      return <path d={pathData(shape.points, false)} {...grab} fill="none" />;
  }
}

export default function SimpleSvgCreator() {
  const [doc, setDoc] = useState<Doc>(DEFAULT_DOC);
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [tool, setTool] = useState<Tool>('rect');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [hover, setHover] = useState<Point | null>(null);
  const [snap, setSnap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [displayWidth, setDisplayWidth] = useState(0);
  const [pngScale, setPngScale] = useState('2');

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const lastCommit = useRef({ key: '', at: 0 });

  const selected = useMemo(() => doc.shapes.find((s) => s.id === selectedId) ?? null, [doc.shapes, selectedId]);

  // User units per displayed pixel, so handles stay the same size on screen
  // however large the canvas is.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    setDisplayWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => setDisplayWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const unit = displayWidth > 0 ? doc.width / displayWidth : 1;

  // ---------------------------------------------------------------- history

  /**
   * Snapshot the document before a change. Repeated changes of the same kind —
   * dragging a slider, say — collapse into one entry so undo steps back by
   * something a person recognises.
   */
  const commit = (key = 'action') => {
    const now = Date.now();
    if (key !== 'action' && lastCommit.current.key === key && now - lastCommit.current.at < 900) {
      lastCommit.current.at = now;
      return;
    }
    lastCommit.current = { key, at: now };
    setPast((p) => [...p, doc].slice(-HISTORY_LIMIT));
    setFuture([]);
  };

  const undo = () => {
    if (past.length === 0) return;
    setDoc(past[past.length - 1]);
    setPast(past.slice(0, -1));
    setFuture([doc, ...future].slice(0, HISTORY_LIMIT));
    lastCommit.current = { key: '', at: 0 };
  };

  const redo = () => {
    if (future.length === 0) return;
    setDoc(future[0]);
    setFuture(future.slice(1));
    setPast([...past, doc].slice(-HISTORY_LIMIT));
    lastCommit.current = { key: '', at: 0 };
  };

  // ---------------------------------------------------------------- editing

  const replaceShape = (id: string, next: Shape) =>
    setDoc((d) => ({ ...d, shapes: d.shapes.map((s) => (s.id === id ? next : s)) }));

  const addShape = (shape: Shape) => {
    commit('add');
    setDoc((d) => ({ ...d, shapes: [...d.shapes, shape] }));
    setSelectedId(shape.id);
  };

  const patchSelected = (patch: Partial<Shape>, key = 'action') => {
    if (!selected) return;
    commit(key);
    replaceShape(selected.id, { ...selected, ...patch } as Shape);
  };

  const removeShape = (id: string) => {
    commit('delete');
    setDoc((d) => ({ ...d, shapes: d.shapes.filter((s) => s.id !== id) }));
    setSelectedId((current) => (current === id ? null : current));
  };

  const reorder = (id: string, delta: number) => {
    const index = doc.shapes.findIndex((s) => s.id === id);
    const next = moveInList(doc.shapes, index, delta);
    if (next === doc.shapes) return;
    commit('reorder');
    setDoc((d) => ({ ...d, shapes: next }));
  };

  // ---------------------------------------------------------------- pointer

  const rawPointer = (e: ReactPointerEvent): Point => {
    const element = overlayRef.current;
    if (!element) return { x: 0, y: 0 };
    return toUser(e.clientX, e.clientY, element.getBoundingClientRect(), doc);
  };

  const snapPoint = (p: Point): Point =>
    snap ? { x: snapValue(p.x, GRID_SIZE), y: snapValue(p.y, GRID_SIZE) } : p;

  const finishDraft = () => {
    const kind = tool === 'polygon' ? 'polygon' : 'path';
    const minimum = kind === 'polygon' ? 3 : 2;
    if (draft.length >= minimum) addShape(polyShape(kind, draft, style));
    setDraft([]);
    setHover(null);
    setTool('select');
  };

  const cancelDraft = () => {
    setDraft([]);
    setHover(null);
  };

  const onCanvasDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const point = snapPoint(rawPointer(e));

    if (tool === 'select') {
      setSelectedId(null);
      return;
    }
    if (tool === 'polygon' || tool === 'path') {
      setDraft((current) => [...current, point]);
      return;
    }
    if (tool === 'text') {
      addShape(createShape('text', point, point, style));
      setTool('select');
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: 'draw', shape: tool, from: point, to: point });
  };

  const onShapeDown = (e: ReactPointerEvent, shape: Shape) => {
    if (e.button !== 0) return;
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelectedId(shape.id);
    overlayRef.current?.setPointerCapture(e.pointerId);
    commit('move');
    setDrag({ kind: 'move', id: shape.id, origin: rawPointer(e), original: shape });
  };

  const onHandleDown = (e: ReactPointerEvent, shape: Shape, handle: Handle) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    overlayRef.current?.setPointerCapture(e.pointerId);
    commit('resize');
    setDrag({ kind: 'resize', id: shape.id, handle, original: shape });
  };

  const onEndpointDown = (e: ReactPointerEvent, shape: LineShape, which: 1 | 2) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    overlayRef.current?.setPointerCapture(e.pointerId);
    commit('endpoint');
    setDrag({ kind: 'endpoint', id: shape.id, which, original: shape });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (draft.length > 0) setHover(snapPoint(rawPointer(e)));
    if (!drag) return;
    const raw = rawPointer(e);
    const point = snapPoint(raw);

    if (drag.kind === 'draw') {
      setDrag({ ...drag, to: point });
      return;
    }
    if (drag.kind === 'move') {
      const bounds = boundsOf(drag.original);
      let dx = raw.x - drag.origin.x;
      let dy = raw.y - drag.origin.y;
      if (snap) {
        dx = snapValue(bounds.x + dx, GRID_SIZE) - bounds.x;
        dy = snapValue(bounds.y + dy, GRID_SIZE) - bounds.y;
      }
      replaceShape(drag.id, moveShape(drag.original, dx, dy));
      return;
    }
    if (drag.kind === 'resize') {
      const local = drag.original.rotation
        ? rotatePoint(point, centerOf(drag.original), -drag.original.rotation)
        : point;
      replaceShape(drag.id, setBounds(drag.original, resizeBounds(boundsOf(drag.original), drag.handle, local)));
      return;
    }
    replaceShape(
      drag.id,
      drag.which === 1
        ? { ...drag.original, x1: point.x, y1: point.y }
        : { ...drag.original, x2: point.x, y2: point.y },
    );
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (drag?.kind === 'draw' && !isDegenerate(drag.shape, drag.from, drag.to)) {
      addShape(createShape(drag.shape, drag.from, drag.to, style));
      setTool('select');
    }
    setDrag(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // ---------------------------------------------------------------- keyboard

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyHandler.current = (e: KeyboardEvent) => {
    // Never steal a key from a field the user is typing in. The target is not
    // always an element — a key pressed with nothing focused arrives on window.
    const target = e.target as HTMLElement | null;
    if (typeof target?.closest === 'function' && target.closest('input, textarea, select, [contenteditable]')) return;
    const meta = e.metaKey || e.ctrlKey;

    if (meta && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (meta && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (selected) addShape(duplicateShape(selected));
      return;
    }
    if (e.key === 'Escape') {
      if (draft.length > 0) cancelDraft();
      else setSelectedId(null);
      return;
    }
    if (e.key === 'Enter' && draft.length > 0) {
      e.preventDefault();
      finishDraft();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      removeShape(selected.id);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const nudges: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const nudge = nudges[e.key];
    if (nudge && selected) {
      e.preventDefault();
      commit('nudge');
      replaceShape(selected.id, moveShape(selected, nudge[0], nudge[1]));
    }
  };

  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // ---------------------------------------------------------------- export

  const serialize = (): string => {
    const node = svgRef.current;
    if (!node) throw new Error('The canvas has not finished loading yet — try again in a moment.');
    const clone = node.cloneNode(true) as SVGSVGElement;
    clone.removeAttribute('class');
    clone.removeAttribute('style');
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
  };

  const run: ToolRun = {
    running: busy,
    progress: null,
    done: 0,
    total: 0,
    currentFile: null,
    result,
    raw: null,
    error,
    taskId: null,
    execute: async () => null,
    executeRaw: async () => null,
    cancel: () => setBusy(false),
    reset: () => {
      setResult(null);
      setError(null);
    },
  };

  const record = (saved: { path: string; name: string; size: number } | null, started: number, note: string) => {
    if (!saved) return;
    setResult({
      results: [
        { ...saved, source: null, sourceSize: null, disposition: 'created', note },
      ],
      failures: [],
      cancelled: false,
      elapsedMs: Date.now() - started,
    });
  };

  const exportSvg = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const started = Date.now();
    try {
      record(await saveTextAs(serialize(), 'drawing.svg'), started, `${doc.width} × ${doc.height}`);
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setBusy(false);
    }
  };

  const exportPng = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const started = Date.now();
    const scale = Number(pngScale);
    const url = URL.createObjectURL(new Blob([serialize()], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('The drawing could not be rendered as an image, so the PNG was not written.'));
        image.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(doc.width * scale);
      canvas.height = Math.round(doc.height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This window cannot draw to a canvas, so PNG export is unavailable.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const bytes = await canvasToBytes(canvas);
      record(await saveAs(bytes, `drawing@${scale}x.png`), started, `${canvas.width} × ${canvas.height} PNG`);
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- render

  const selectionBounds = selected ? boundsOf(selected) : null;
  const selectionCenter = selected ? centerOf(selected) : null;
  const handleSize = 9 * unit;
  const previewShape = drag?.kind === 'draw' ? createShape(drag.shape, drag.from, drag.to, style) : null;
  const draftPoints = hover && draft.length > 0 ? [...draft, hover] : draft;

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Canvas"
            description={`${doc.width} × ${doc.height} · ${doc.shapes.length} shape${doc.shapes.length === 1 ? '' : 's'}`}
            actions={
              <>
                <IconButton icon="Undo2" label="Undo (⌘Z)" size="sm" disabled={past.length === 0} onClick={undo} />
                <IconButton icon="Redo2" label="Redo (⇧⌘Z)" size="sm" disabled={future.length === 0} onClick={redo} />
              </>
            }
          >
            <div className="mb-3 flex flex-wrap gap-1.5">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  aria-pressed={tool === t.id}
                  onClick={() => {
                    if (draft.length > 0) cancelDraft();
                    setTool(t.id);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                    tool === t.id
                      ? 'border-ink bg-ink text-panel'
                      : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:text-ink'
                  }`}
                >
                  <Icon name={t.icon} size={14} />
                  {t.label}
                </button>
              ))}
            </div>

            {draft.length > 0 && (
              <Alert
                tone="info"
                className="mb-3"
                title={`${draft.length} point${draft.length === 1 ? '' : 's'} placed`}
                action={
                  <div className="flex gap-1.5">
                    <Button size="sm" icon="Check" onClick={finishDraft}>
                      Finish
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelDraft}>
                      Cancel
                    </Button>
                  </div>
                }
              >
                Click to add more points. Enter or a double-click finishes the shape, Escape throws it away.
              </Alert>
            )}

            <div
              ref={stageRef}
              className="checkerboard relative mx-auto overflow-hidden rounded-lg border border-line"
              style={{ width: '100%', maxWidth: doc.width, aspectRatio: `${doc.width} / ${doc.height}` }}
            >
              <svg
                ref={svgRef}
                xmlns="http://www.w3.org/2000/svg"
                width={doc.width}
                height={doc.height}
                viewBox={`0 0 ${doc.width} ${doc.height}`}
                className="block h-full w-full"
              >
                {doc.background !== 'none' && <rect width={doc.width} height={doc.height} fill={doc.background} />}
                {doc.shapes.map((shape) => (
                  <ShapeNode key={shape.id} shape={shape} />
                ))}
              </svg>

              <svg
                ref={overlayRef}
                viewBox={`0 0 ${doc.width} ${doc.height}`}
                className={`absolute inset-0 h-full w-full touch-none ${tool === 'select' ? '' : 'cursor-crosshair'}`}
                onPointerDown={onCanvasDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={() => draft.length > 0 && finishDraft()}
              >
                {showGrid && (
                  <>
                    <defs>
                      <pattern id="creator-grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                        <path
                          d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
                          fill="none"
                          style={{ stroke: 'var(--color-line)' }}
                          strokeWidth={unit}
                        />
                      </pattern>
                    </defs>
                    <rect width={doc.width} height={doc.height} fill="url(#creator-grid)" pointerEvents="none" />
                  </>
                )}

                {doc.shapes.map((shape) => (
                  <HitProxy key={shape.id} shape={shape} onDown={(e) => onShapeDown(e, shape)} />
                ))}

                {previewShape && (
                  <g opacity={0.7} pointerEvents="none">
                    <ShapeNode shape={previewShape} />
                  </g>
                )}

                {draftPoints.length > 0 && (
                  <g pointerEvents="none">
                    <path
                      d={pathData(draftPoints, tool === 'polygon' && draftPoints.length > 2)}
                      fill="none"
                      style={{ stroke: 'var(--color-accent)' }}
                      strokeWidth={1.5 * unit}
                      strokeDasharray={`${5 * unit} ${4 * unit}`}
                    />
                    {draft.map((p, index) => (
                      <circle key={`${p.x}-${p.y}-${index}`} cx={p.x} cy={p.y} r={3.5 * unit} style={{ fill: 'var(--color-accent)' }} />
                    ))}
                  </g>
                )}

                {selected && selectionBounds && selectionCenter && (
                  <g
                    transform={
                      selected.rotation
                        ? `rotate(${round(selected.rotation)} ${round(selectionCenter.x)} ${round(selectionCenter.y)})`
                        : undefined
                    }
                  >
                    <rect
                      x={selectionBounds.x}
                      y={selectionBounds.y}
                      width={Math.max(selectionBounds.width, 1)}
                      height={Math.max(selectionBounds.height, 1)}
                      fill="none"
                      style={{ stroke: 'var(--color-accent)' }}
                      strokeWidth={1.2 * unit}
                      strokeDasharray={`${4 * unit} ${3 * unit}`}
                      pointerEvents="none"
                    />
                    {canResize(selected) &&
                      HANDLES.map((handle) => {
                        const x =
                          handle === 'nw' || handle === 'sw' ? selectionBounds.x : selectionBounds.x + selectionBounds.width;
                        const y =
                          handle === 'nw' || handle === 'ne' ? selectionBounds.y : selectionBounds.y + selectionBounds.height;
                        return (
                          <rect
                            key={handle}
                            x={x - handleSize / 2}
                            y={y - handleSize / 2}
                            width={handleSize}
                            height={handleSize}
                            rx={1.5 * unit}
                            style={{ fill: 'var(--color-panel)', stroke: 'var(--color-accent)', cursor: HANDLE_CURSOR[handle] }}
                            strokeWidth={1.2 * unit}
                            onPointerDown={(e) => onHandleDown(e, selected, handle)}
                          />
                        );
                      })}
                    {(selected.kind === 'line' || selected.kind === 'arrow') &&
                      ([1, 2] as const).map((which) => (
                        <circle
                          key={which}
                          cx={which === 1 ? selected.x1 : selected.x2}
                          cy={which === 1 ? selected.y1 : selected.y2}
                          r={handleSize / 1.7}
                          style={{ fill: 'var(--color-panel)', stroke: 'var(--color-accent)', cursor: 'grab' }}
                          strokeWidth={1.2 * unit}
                          onPointerDown={(e) => onEndpointDown(e, selected, which)}
                        />
                      ))}
                  </g>
                )}
              </svg>

              {doc.shapes.length === 0 && draft.length === 0 && !drag && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="rounded-lg bg-panel/85 px-3 py-1.5 text-[12.5px] text-ink-faint">
                    Pick a tool above and drag on the canvas
                  </p>
                </div>
              )}
            </div>

            <p className="mt-2 text-[11.5px] text-ink-faint">
              Drag to move · corner handles resize · arrow keys nudge (⇧ for 10) · ⌘Z undo · ⌘D duplicate · Delete removes
            </p>
          </Section>

          {run.error && <ErrorDisplay error={run.error} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Drawing exported" />}
        </>
      }
      aside={
        <>
          {selected ? (
            <Section
              title={describeShape(selected)}
              description={kindLabel(selected.kind)}
              actions={
                <>
                  <IconButton icon="CopyPlus" label="Duplicate" size="sm" onClick={() => addShape(duplicateShape(selected))} />
                  <IconButton icon="Trash2" label="Delete" size="sm" onClick={() => removeShape(selected.id)} />
                </>
              }
            >
              <div className="space-y-3">
                <Field inline label="Fill" hint={selected.fill === 'none' ? 'No fill' : undefined}>
                  <Switch
                    checked={selected.fill !== 'none'}
                    onCheckedChange={(on) => patchSelected({ fill: on ? style.fill : 'none' })}
                    label="Fill"
                  />
                </Field>
                {selected.fill !== 'none' && (
                  <ColorInput value={selected.fill} onChange={(value) => patchSelected({ fill: value }, 'fill')} />
                )}

                <Field inline label="Stroke" hint={selected.stroke === 'none' ? 'No stroke' : undefined}>
                  <Switch
                    checked={selected.stroke !== 'none'}
                    onCheckedChange={(on) => patchSelected({ stroke: on ? style.stroke : 'none' })}
                    label="Stroke"
                  />
                </Field>
                {selected.stroke !== 'none' && (
                  <>
                    <ColorInput value={selected.stroke} onChange={(value) => patchSelected({ stroke: value }, 'stroke')} />
                    <Field label={`Stroke width — ${selected.strokeWidth}`}>
                      <Slider
                        min={0.5}
                        max={40}
                        step={0.5}
                        value={selected.strokeWidth}
                        onChange={(value) => patchSelected({ strokeWidth: value }, 'strokeWidth')}
                      />
                    </Field>
                  </>
                )}

                <OptionsGrid cols={2}>
                  <Field label={`Opacity — ${Math.round(selected.opacity * 100)}%`}>
                    <Slider
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={selected.opacity}
                      onChange={(value) => patchSelected({ opacity: value }, 'opacity')}
                    />
                  </Field>
                  <Field label={`Rotation — ${selected.rotation}°`}>
                    <Slider
                      min={0}
                      max={359}
                      value={selected.rotation}
                      onChange={(value) => patchSelected({ rotation: value }, 'rotation')}
                    />
                  </Field>
                </OptionsGrid>

                {selected.kind === 'rect' && (
                  <Field label={`Corner radius — ${(selected as RectShape).rx}`}>
                    <Slider
                      min={0}
                      max={Math.round(Math.min((selected as RectShape).width, (selected as RectShape).height) / 2)}
                      value={(selected as RectShape).rx}
                      onChange={(value) => patchSelected({ rx: value } as Partial<Shape>, 'rx')}
                    />
                  </Field>
                )}

                {selected.kind === 'text' && (
                  <>
                    <Field label="Text">
                      <Input
                        value={(selected as TextShape).text}
                        onChange={(e) => patchSelected({ text: e.target.value } as Partial<Shape>, 'text')}
                      />
                    </Field>
                    <OptionsGrid cols={2}>
                      <Field label="Size">
                        <NumberInput
                          value={(selected as TextShape).fontSize}
                          min={4}
                          max={400}
                          suffix="px"
                          onValueChange={(value) => patchSelected({ fontSize: value } as Partial<Shape>, 'fontSize')}
                        />
                      </Field>
                      <Field label="Weight">
                        <Select
                          value={String((selected as TextShape).fontWeight)}
                          onChange={(e) => patchSelected({ fontWeight: Number(e.target.value) } as Partial<Shape>)}
                          options={[400, 500, 600, 700, 800].map((w) => ({ value: String(w), label: String(w) }))}
                        />
                      </Field>
                    </OptionsGrid>
                  </>
                )}

                <OptionsGrid cols={2}>
                  <Field label="X">
                    <NumberInput
                      value={round(selectionBounds?.x ?? 0)}
                      onValueChange={(value) => {
                        commit('position');
                        replaceShape(selected.id, moveShape(selected, value - (selectionBounds?.x ?? 0), 0));
                      }}
                    />
                  </Field>
                  <Field label="Y">
                    <NumberInput
                      value={round(selectionBounds?.y ?? 0)}
                      onValueChange={(value) => {
                        commit('position');
                        replaceShape(selected.id, moveShape(selected, 0, value - (selectionBounds?.y ?? 0)));
                      }}
                    />
                  </Field>
                  {canResize(selected) && selectionBounds && (
                    <>
                      <Field label="Width">
                        <NumberInput
                          value={round(selectionBounds.width)}
                          min={1}
                          onValueChange={(value) => {
                            commit('size');
                            replaceShape(selected.id, setBounds(selected, { ...selectionBounds, width: value }));
                          }}
                        />
                      </Field>
                      <Field label="Height">
                        <NumberInput
                          value={round(selectionBounds.height)}
                          min={1}
                          onValueChange={(value) => {
                            commit('size');
                            replaceShape(selected.id, setBounds(selected, { ...selectionBounds, height: value }));
                          }}
                        />
                      </Field>
                    </>
                  )}
                </OptionsGrid>

                {(selected.kind === 'polygon' || selected.kind === 'path') && (
                  <p className="text-[11.5px] text-ink-faint">
                    {(selected as PolyShape).points.length} points. Draw a new one to change its outline.
                  </p>
                )}
              </div>
            </Section>
          ) : (
            <Section title="New shape" description="The colours the next shape is drawn with">
              <div className="space-y-3">
                <Field label="Fill">
                  <ColorInput value={style.fill} onChange={(value) => setStyle((s) => ({ ...s, fill: value }))} />
                </Field>
                <Field label="Stroke">
                  <ColorInput value={style.stroke} onChange={(value) => setStyle((s) => ({ ...s, stroke: value }))} />
                </Field>
                <Field label={`Stroke width — ${style.strokeWidth}`}>
                  <Slider
                    min={0}
                    max={40}
                    step={0.5}
                    value={style.strokeWidth}
                    onChange={(value) => setStyle((s) => ({ ...s, strokeWidth: value }))}
                  />
                </Field>
                <p className="text-[11.5px] text-ink-faint">Select a shape on the canvas to edit it instead.</p>
              </div>
            </Section>
          )}

          <Section
            title="Layers"
            description={doc.shapes.length === 0 ? 'Nothing drawn yet' : 'Topmost first'}
            actions={
              doc.shapes.length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="Trash2"
                  onClick={() => {
                    commit('clear');
                    setDoc((d) => ({ ...d, shapes: [] }));
                    setSelectedId(null);
                  }}
                >
                  Clear
                </Button>
              ) : undefined
            }
          >
            {doc.shapes.length === 0 ? (
              <p className="text-[12.5px] text-ink-faint">Shapes appear here as you draw them.</p>
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {[...doc.shapes].reverse().map((shape) => (
                  <li
                    key={shape.id}
                    className={`flex items-center gap-1 rounded-lg px-1.5 py-1 ${
                      shape.id === selectedId ? 'bg-accent-soft' : 'hover:bg-canvas'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(shape.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className="h-4 w-4 shrink-0 rounded border border-line"
                        style={{ background: shape.fill === 'none' ? shape.stroke : shape.fill }}
                      />
                      <span className="truncate text-[12.5px] text-ink">{describeShape(shape)}</span>
                    </button>
                    <IconButton icon="ArrowUp" label="Bring forward" size="sm" onClick={() => reorder(shape.id, 1)} />
                    <IconButton icon="ArrowDown" label="Send back" size="sm" onClick={() => reorder(shape.id, -1)} />
                    <IconButton icon="CopyPlus" label="Duplicate" size="sm" onClick={() => addShape(duplicateShape(shape))} />
                    <IconButton icon="Trash2" label="Delete" size="sm" onClick={() => removeShape(shape.id)} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Canvas & export">
            <div className="space-y-3">
              <OptionsGrid cols={2}>
                <Field label="Width">
                  <NumberInput
                    value={doc.width}
                    min={16}
                    max={4000}
                    suffix="px"
                    onValueChange={(value) => {
                      commit('canvas');
                      setDoc((d) => ({ ...d, width: Math.max(16, value) }));
                    }}
                  />
                </Field>
                <Field label="Height">
                  <NumberInput
                    value={doc.height}
                    min={16}
                    max={4000}
                    suffix="px"
                    onValueChange={(value) => {
                      commit('canvas');
                      setDoc((d) => ({ ...d, height: Math.max(16, value) }));
                    }}
                  />
                </Field>
              </OptionsGrid>

              <Field label="Background">
                <Segmented
                  value={doc.background === 'none' ? 'transparent' : 'colour'}
                  onChange={(value) => {
                    commit('canvas');
                    setDoc((d) => ({ ...d, background: value === 'transparent' ? 'none' : '#ffffff' }));
                  }}
                  options={[
                    { value: 'colour', label: 'Colour' },
                    { value: 'transparent', label: 'Transparent' },
                  ]}
                  className="w-full"
                />
              </Field>
              {doc.background !== 'none' && (
                <ColorInput
                  value={doc.background}
                  onChange={(value) => {
                    commit('background');
                    setDoc((d) => ({ ...d, background: value }));
                  }}
                />
              )}

              <OptionsGrid cols={1}>
                <Field inline label="Snap to grid" hint={`${GRID_SIZE} unit steps`}>
                  <Switch checked={snap} onCheckedChange={setSnap} label="Snap to grid" />
                </Field>
                <Field inline label="Show grid">
                  <Switch checked={showGrid} onCheckedChange={setShowGrid} label="Show grid" />
                </Field>
              </OptionsGrid>

              <Field label="PNG scale" hint={`Exports at ${Math.round(doc.width * Number(pngScale))} × ${Math.round(doc.height * Number(pngScale))}`}>
                <Select
                  value={pngScale}
                  onChange={(e) => setPngScale(e.target.value)}
                  options={[
                    { value: '1', label: '1× — same size' },
                    { value: '2', label: '2× — retina' },
                    { value: '3', label: '3×' },
                    { value: '4', label: '4×' },
                  ]}
                />
              </Field>
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={() => void exportSvg()}
            label="Export SVG"
            icon="Download"
            disabled={doc.shapes.length === 0}
            disabledReason="Draw something first."
          >
            <Button size="lg" icon="Image" disabled={busy || doc.shapes.length === 0} onClick={() => void exportPng()}>
              Export PNG
            </Button>
          </ToolActions>
        </>
      }
    />
  );
}
