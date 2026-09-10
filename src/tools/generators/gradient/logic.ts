/**
 * Gradient maths shared by the CSS string, the PNG export and the SVG export, so
 * all three describe the same picture.
 *
 * CSS angles are the reference: 0deg points to the top and turns clockwise, and
 * both radial forms use the `farthest-corner` sizing browsers default to.
 */

export type GradientType = 'linear' | 'radial' | 'conic';
export type RadialShape = 'circle' | 'ellipse';

export interface GradientStop {
  id: string;
  color: string;
  /** 0–100 along the gradient line. */
  position: number;
}

export interface GradientSpec {
  type: GradientType;
  /** Degrees, for linear and conic. */
  angle: number;
  shape: RadialShape;
  /** Centre of a radial or conic gradient, in percent of the box. */
  position: { x: number; y: number };
  stops: GradientStop[];
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function parseHex(input: string): Rgb | null {
  const raw = input.trim().replace(/^#/, '');
  const hex = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function sortedStops(stops: GradientStop[]): GradientStop[] {
  return [...stops]
    .map((s) => ({ ...s, position: clamp(s.position, 0, 100) }))
    .sort((a, b) => a.position - b.position);
}

/** The colour a gradient shows at `percent` along its line. */
export function colorAt(stops: GradientStop[], percent: number): string {
  const list = sortedStops(stops);
  if (list.length === 0) return '#000000';
  if (percent <= list[0].position) return list[0].color;
  const last = list[list.length - 1];
  if (percent >= last.position) return last.color;
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1];
    const b = list[i];
    if (percent <= b.position) {
      const span = b.position - a.position;
      const t = span === 0 ? 0 : (percent - a.position) / span;
      const ca = parseHex(a.color) ?? { r: 0, g: 0, b: 0 };
      const cb = parseHex(b.color) ?? { r: 0, g: 0, b: 0 };
      return rgbToHex({
        r: ca.r + (cb.r - ca.r) * t,
        g: ca.g + (cb.g - ca.g) * t,
        b: ca.b + (cb.b - ca.b) * t,
      });
    }
  }
  return last.color;
}

function stopList(spec: GradientSpec): string {
  return sortedStops(spec.stops)
    .map((s) => `${s.color} ${Math.round(s.position)}%`)
    .join(', ');
}

/** The CSS gradient function, e.g. `linear-gradient(45deg, #fff 0%, #000 100%)`. */
export function cssGradient(spec: GradientSpec): string {
  const stops = stopList(spec);
  const at = `${Math.round(spec.position.x)}% ${Math.round(spec.position.y)}%`;
  switch (spec.type) {
    case 'linear':
      return `linear-gradient(${Math.round(spec.angle)}deg, ${stops})`;
    case 'radial':
      return `radial-gradient(${spec.shape} at ${at}, ${stops})`;
    case 'conic':
      return `conic-gradient(from ${Math.round(spec.angle)}deg at ${at}, ${stops})`;
  }
}

export function cssDeclaration(spec: GradientSpec): string {
  return `background-image: ${cssGradient(spec)};`;
}

/** Where the gradient line starts and ends inside a w×h box, per the CSS spec. */
export function linearEndpoints(angle: number, width: number, height: number) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const length = Math.abs(width * dx) + Math.abs(height * dy);
  const cx = width / 2;
  const cy = height / 2;
  return {
    x0: cx - (dx * length) / 2,
    y0: cy - (dy * length) / 2,
    x1: cx + (dx * length) / 2,
    y1: cy + (dy * length) / 2,
  };
}

/** `farthest-corner` radii for a radial gradient centred at (cx, cy). */
export function radialRadii(shape: RadialShape, cx: number, cy: number, width: number, height: number) {
  const fx = Math.max(Math.max(cx, width - cx), 1);
  const fy = Math.max(Math.max(cy, height - cy), 1);
  if (shape === 'circle') {
    const r = Math.max(Math.hypot(fx, fy), 1);
    return { rx: r, ry: r };
  }
  // The farthest-corner ellipse keeps the farthest-side ratio and passes through
  // the corner, which works out at exactly √2 times the farthest-side radii.
  return { rx: fx * Math.SQRT2, ry: fy * Math.SQRT2 };
}

export function centreOf(spec: GradientSpec, width: number, height: number) {
  return { cx: (spec.position.x / 100) * width, cy: (spec.position.y / 100) * height };
}

// ------------------------------------------------------------------ painting

/** How many wedges approximate a conic gradient when one is not available. */
const CONIC_SLICES = 360;

function applyStops(gradient: CanvasGradient, spec: GradientSpec): void {
  const list = sortedStops(spec.stops);
  let previous = -1;
  for (const stop of list) {
    // Canvas insists on non-decreasing offsets; CSS tolerates any order.
    const offset = Math.max(previous, clamp(stop.position / 100, 0, 1));
    gradient.addColorStop(offset, stop.color);
    previous = offset;
  }
}

function paintConicWedges(
  ctx: CanvasRenderingContext2D,
  spec: GradientSpec,
  width: number,
  height: number,
): void {
  const { cx, cy } = centreOf(spec, width, height);
  const radius = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy)) + 2;
  const start = ((spec.angle - 90) * Math.PI) / 180;
  const step = (Math.PI * 2) / CONIC_SLICES;
  for (let i = 0; i < CONIC_SLICES; i += 1) {
    ctx.fillStyle = colorAt(spec.stops, ((i + 0.5) / CONIC_SLICES) * 100);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    // A hair of overlap keeps hairline seams out of the exported image.
    ctx.arc(cx, cy, radius, start + i * step, start + (i + 1) * step + step * 0.05);
    ctx.closePath();
    ctx.fill();
  }
}

/** Draw the gradient across the whole context, matching what CSS renders. */
export function paintGradient(
  ctx: CanvasRenderingContext2D,
  spec: GradientSpec,
  width: number,
  height: number,
): void {
  if (spec.stops.length === 0) {
    throw new Error('Add at least one colour stop before exporting.');
  }
  ctx.clearRect(0, 0, width, height);
  if (spec.stops.length === 1) {
    ctx.fillStyle = spec.stops[0].color;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (spec.type === 'linear') {
    const { x0, y0, x1, y1 } = linearEndpoints(spec.angle, width, height);
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    applyStops(gradient, spec);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (spec.type === 'radial') {
    const { cx, cy } = centreOf(spec, width, height);
    const { rx, ry } = radialRadii(spec.shape, cx, cy, width, height);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    applyStops(gradient, spec);
    ctx.save();
    if (rx !== ry) {
      // Canvas only draws circular gradients; squash the space to get an ellipse.
      const scale = ry / rx;
      ctx.translate(0, cy);
      ctx.scale(1, scale);
      ctx.translate(0, -cy);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, cy + (0 - cy) / scale, width, height / scale);
    } else {
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
    return;
  }

  const { cx, cy } = centreOf(spec, width, height);
  const create = (ctx as CanvasRenderingContext2D & {
    createConicGradient?: (startAngle: number, x: number, y: number) => CanvasGradient;
  }).createConicGradient;
  if (typeof create === 'function') {
    const gradient = create.call(ctx, ((spec.angle - 90) * Math.PI) / 180, cx, cy);
    applyStops(gradient, spec);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  paintConicWedges(ctx, spec, width, height);
}

// ------------------------------------------------------------------ svg

function svgStops(spec: GradientSpec): string {
  return sortedStops(spec.stops)
    .map((s) => `      <stop offset="${(clamp(s.position, 0, 100) / 100).toFixed(4)}" stop-color="${s.color}" />`)
    .join('\n');
}

function conicWedgePaths(spec: GradientSpec, width: number, height: number): string {
  const { cx, cy } = centreOf(spec, width, height);
  const radius = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy)) + 2;
  const start = ((spec.angle - 90) * Math.PI) / 180;
  const step = (Math.PI * 2) / CONIC_SLICES;
  const paths: string[] = [];
  for (let i = 0; i < CONIC_SLICES; i += 1) {
    const a0 = start + i * step;
    const a1 = start + (i + 1) * step + step * 0.05;
    const x0 = (cx + Math.cos(a0) * radius).toFixed(2);
    const y0 = (cy + Math.sin(a0) * radius).toFixed(2);
    const x1 = (cx + Math.cos(a1) * radius).toFixed(2);
    const y1 = (cy + Math.sin(a1) * radius).toFixed(2);
    const color = colorAt(spec.stops, ((i + 0.5) / CONIC_SLICES) * 100);
    paths.push(
      `    <path d="M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${x0} ${y0} A ${radius.toFixed(2)} ${radius.toFixed(
        2,
      )} 0 0 1 ${x1} ${y1} Z" fill="${color}" />`,
    );
  }
  return paths.join('\n');
}

/**
 * SVG has no conic gradient, so a conic export is approximated with 360 wedges —
 * the same approximation the PNG falls back to on older engines.
 */
export function svgGradient(spec: GradientSpec, width: number, height: number): string {
  const header = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  if (spec.type === 'conic') {
    // The root viewport clips the wedges that reach past the corners.
    return [header, '  <g>', conicWedgePaths(spec, width, height), '  </g>', '</svg>', ''].join('\n');
  }

  if (spec.type === 'linear') {
    const { x0, y0, x1, y1 } = linearEndpoints(spec.angle, width, height);
    return [
      header,
      '  <defs>',
      `    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${x0.toFixed(2)}" y1="${y0.toFixed(
        2,
      )}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}">`,
      svgStops(spec),
      '    </linearGradient>',
      '  </defs>',
      `  <rect width="${width}" height="${height}" fill="url(#g)" />`,
      '</svg>',
      '',
    ].join('\n');
  }

  const { cx, cy } = centreOf(spec, width, height);
  const { rx, ry } = radialRadii(spec.shape, cx, cy, width, height);
  const transform =
    rx === ry
      ? ''
      : ` gradientTransform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(1 ${(ry / rx).toFixed(
          4,
        )}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})"`;
  return [
    header,
    '  <defs>',
    `    <radialGradient id="g" gradientUnits="userSpaceOnUse" cx="${cx.toFixed(2)}" cy="${cy.toFixed(
      2,
    )}" r="${rx.toFixed(2)}"${transform}>`,
    svgStops(spec),
    '    </radialGradient>',
    '  </defs>',
    `  <rect width="${width}" height="${height}" fill="url(#g)" />`,
    '</svg>',
    '',
  ].join('\n');
}
