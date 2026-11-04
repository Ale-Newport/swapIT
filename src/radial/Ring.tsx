import { memo, useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Icon } from '@/components/ui';
import {
  CENTER,
  DEAD_ZONE,
  MAX_SLOTS,
  REACH,
  WINDOW_SIZE,
  hitSlot,
  petalAnchor,
  petalPath,
  RING,
  unwrapAngle,
  type Point,
} from './geometry';
import type { RadialItem } from './model';

export interface RingProps {
  items: RadialItem[];
  hover: number | null;
  pressed: boolean;
  closing: boolean;
  dragging: boolean;
  showKeys: boolean;
  /** Changes whenever a different ring is shown, so the entrance animation replays. */
  menuKey: string;
  onPoint: (point: Point | null) => void;
  onPress: (pressed: boolean) => void;
  onSelect: (index: number) => void;
  onCoreClick: () => void;
  onDismiss: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

export function slotCount(itemCount: number): number {
  return Math.min(MAX_SLOTS, Math.max(3, itemCount));
}

const VIEWBOX = `0 0 ${WINDOW_SIZE} ${WINDOW_SIZE}`;
/** The paint coordinates below were drawn for a 560 px stage; scale them to this one. */
const K = WINDOW_SIZE / 560;
const px = (n: number) => String(Math.round(n * K));

/** Shared SVG paint: gradients and the glass-edge bevel. Rendered once per ring. */
function Defs() {
  return (
    <defs>
      <linearGradient id="rgFill" gradientUnits="userSpaceOnUse" x1={px(110)} y1={px(50)} x2={px(450)} y2={px(510)}>
        <stop offset="0" className="rg-stop-fill-a" />
        <stop offset="1" className="rg-stop-fill-b" />
      </linearGradient>
      <linearGradient id="rgRim" gradientUnits="userSpaceOnUse" x1={px(80)} y1={px(30)} x2={px(480)} y2={px(530)}>
        <stop offset="0" className="rg-stop-rim-a" />
        <stop offset="0.46" className="rg-stop-rim-b" />
        <stop offset="1" className="rg-stop-rim-c" />
      </linearGradient>
      <linearGradient id="rgLensFill" gradientUnits="userSpaceOnUse" x1={px(280)} y1={px(30)} x2={px(280)} y2={px(190)}>
        <stop offset="0" className="rg-stop-lens-a" />
        <stop offset="1" className="rg-stop-lens-b" />
      </linearGradient>
      <linearGradient id="rgLensRim" gradientUnits="userSpaceOnUse" x1={px(200)} y1={px(20)} x2={px(360)} y2={px(200)}>
        <stop offset="0" stopColor="#fff" stopOpacity="1" />
        <stop offset="0.55" stopColor="#fff" stopOpacity="0.28" />
        <stop offset="1" stopColor="#fff" stopOpacity="0.7" />
      </linearGradient>
      {/*
        The bevel: blur the shape's alpha into a soft height map, light it from the
        top-left, keep only what falls on the shape. It reads as the thick, rounded
        edge of a glass slab.
      */}
      <filter id="rgBevel" x="-4%" y="-4%" width="108%" height="108%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.9" result="height" />
        <feSpecularLighting
          in="height"
          surfaceScale="2.8"
          specularConstant="0.95"
          specularExponent="24"
          lightingColor="#ffffff"
          result="spec"
        >
          <feDistantLight azimuth="232" elevation="46" />
        </feSpecularLighting>
        <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />
        <feComponentTransfer in="specIn" result="specSoft">
          <feFuncA type="linear" slope="0.62" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="specSoft" />
        </feMerge>
      </filter>
    </defs>
  );
}

function RingImpl({
  items,
  hover,
  pressed,
  closing,
  dragging,
  showKeys,
  menuKey,
  onPoint,
  onPress,
  onSelect,
  onCoreClick,
  onDismiss,
  footer,
  children,
}: RingProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const slots = slotCount(items.length);
  const rotation = useRef({ deg: 0, key: '' });

  const paths = useMemo(() => Array.from({ length: slots }, (_, i) => petalPath(slots, i)), [slots]);
  const lensPath = useMemo(() => petalPath(slots, 0), [slots]);

  // Keep the lens angle continuous so it takes the short way round the ring.
  const lensKey = `${menuKey}:${slots}`;
  if (rotation.current.key !== lensKey) rotation.current = { deg: 0, key: lensKey };
  if (hover !== null) {
    const target = (hover * 360) / slots;
    rotation.current.deg = (unwrapAngle((rotation.current.deg * Math.PI) / 180, (target * Math.PI) / 180) * 180) / Math.PI;
  }

  const toPoint = (e: ReactPointerEvent): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const handleUp = (e: ReactPointerEvent) => {
    onPress(false);
    const p = toPoint(e);
    const slot = hitSlot(p, slots, items.length);
    if (slot !== null) {
      onSelect(slot);
      return;
    }
    const r = Math.hypot(p.x - CENTER, p.y - CENTER);
    if (r < DEAD_ZONE + 24) onCoreClick();
    else if (r > REACH || r > RING.outer) onDismiss();
  };

  return (
    <div
      ref={stageRef}
      className="rg-stage"
      style={{
        ['--rg-core' as string]: `${RING.core}px`,
        ['--rg-inner' as string]: `${RING.inner}px`,
        ['--rg-outer' as string]: `${RING.outer}px`,
        ['--rg-size' as string]: `${WINDOW_SIZE}px`,
      }}
      data-closing={closing}
      data-keys={showKeys}
      data-dragging={dragging}
      onPointerMove={(e) => onPoint(toPoint(e))}
      onPointerLeave={() => onPoint(null)}
      onPointerDown={(e) => {
        if (e.button === 0) onPress(true);
      }}
      onPointerUp={handleUp}
      onPointerCancel={() => onPress(false)}
    >
      <svg className="rg-svg rg-ring-shadow" viewBox={VIEWBOX} aria-hidden="true">
        <Defs />
        <g key={`petals-${menuKey}`} filter="url(#rgBevel)">
          {paths.map((d, i) => (
            <path
              key={i}
              className="rg-petal"
              d={d}
              data-empty={i >= items.length}
              data-dim={Boolean(items[i]?.unavailable)}
              style={{ ['--i' as string]: i }}
            />
          ))}
        </g>
      </svg>

      <div className="rg-sheen" aria-hidden="true" />

      <div
        key={`lens-${lensKey}`}
        className="rg-lens"
        data-on={hover !== null && !closing}
        data-pressed={pressed}
        style={{ transform: `rotate(${rotation.current.deg}deg)` }}
        aria-hidden="true"
      >
        <div className="rg-lens-body">
          <svg className="rg-lens-svg" viewBox={VIEWBOX}>
            <g className="rg-lens-glow">
              <path className="rg-lens-fill" d={lensPath} filter="url(#rgBevel)" />
              <path className="rg-lens-tint" d={lensPath} />
            </g>
          </svg>
        </div>
      </div>

      <div key={`items-${menuKey}`} className="rg-items">
        {items.map((item, i) => {
          const at = petalAnchor(slots, i);
          return (
            <div
              key={item.id}
              className="rg-item"
              data-active={hover === i}
              data-unavailable={Boolean(item.unavailable)}
              data-menu={Boolean(item.children)}
              data-tone={item.tone ?? 'default'}
              style={{ left: at.x, top: at.y, ['--i' as string]: i }}
            >
              <span className="rg-key">{i + 1}</span>
              {item.glyph ? (
                <span className="rg-glyph" data-long={item.glyph.length > 3}>
                  {item.glyph}
                </span>
              ) : (
                <span className="rg-item-icon">
                  <Icon name={item.icon} size={22} strokeWidth={1.75} />
                </span>
              )}
              <span className="rg-item-label">{item.label}</span>
            </div>
          );
        })}
      </div>

      <div className="rg-core" data-drop={dragging && hover !== null}>
        {children}
      </div>

      {footer}
    </div>
  );
}

export const Ring = memo(RingImpl);
