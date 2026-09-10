/**
 * Pure analysis for the SVG viewer. Everything here works on the markup as
 * text — the document is parsed with DOMParser, never injected into the page,
 * so a file carrying a <script> is described rather than executed.
 */

export interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface SvgLength {
  value: number;
  unit: string;
  /** CSS pixels, or null for units that depend on context (%, em, ex). */
  px: number | null;
}

const UNIT_PX: Record<string, number> = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 25.4 / 4,
};

export function parseLength(raw: string | null | undefined): SvgLength | null {
  if (raw === null || raw === undefined) return null;
  const text = raw.trim();
  if (!text) return null;
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2].toLowerCase();
  const factor = UNIT_PX[unit];
  return { value, unit, px: factor === undefined ? null : value * factor };
}

export function parseViewBox(raw: string | null | undefined): ViewBox | null {
  if (!raw) return null;
  const parts = raw.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [minX, minY, width, height] = nums;
  if (width <= 0 || height <= 0) return null;
  return { minX, minY, width, height };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** "16:9" when the numbers reduce cleanly, "1.41:1" when they do not. */
export function aspectRatioLabel(width: number | null, height: number | null): string | null {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  const whole = [width, height].every((n) => Math.abs(n - Math.round(n)) < 1e-6);
  if (whole) {
    const w = Math.round(width);
    const h = Math.round(height);
    const d = gcd(w, h);
    if (Math.max(w / d, h / d) <= 100) return `${w / d}:${h / d}`;
  }
  const ratio = width / height;
  return ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
}

export interface ElementCount {
  tag: string;
  count: number;
}

export interface SvgReport {
  /** False when the file is not parseable XML or has no <svg> root. */
  ok: boolean;
  error: string | null;
  title: string | null;
  widthAttr: string | null;
  heightAttr: string | null;
  widthPx: number | null;
  heightPx: number | null;
  viewBoxAttr: string | null;
  viewBox: ViewBox | null;
  aspect: string | null;
  /** Pixel size to draw at: the width/height attributes, else the viewBox. */
  renderWidth: number | null;
  renderHeight: number | null;
  elements: ElementCount[];
  elementTotal: number;
  nodeTotal: number;
  maxDepth: number;
  scripts: number;
  eventHandlers: number;
  embeddedImages: number;
  linkedImages: number;
  externalRefs: string[];
  styleElements: number;
  styleAttributes: number;
  foreignObjects: number;
  ids: number;
}

const ABSOLUTE_URL = /^(?:https?:)?\/\//i;

function collectUrls(value: string, out: Set<string>): void {
  const direct = value.trim();
  if (ABSOLUTE_URL.test(direct)) out.add(direct);
  for (const match of value.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    const url = match[1].trim();
    if (ABSOLUTE_URL.test(url)) out.add(url);
  }
  for (const match of value.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/gi)) {
    const url = match[1].trim();
    if (ABSOLUTE_URL.test(url)) out.add(url);
  }
}

function hrefOf(el: Element): string | null {
  return (
    el.getAttribute('href') ??
    el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
    el.getAttribute('xlink:href')
  );
}

/**
 * Describe an SVG: how big it is, what it is made of, and anything a person
 * should know before trusting it (scripts, embedded rasters, external loads).
 */
export function analyzeSvg(source: string): SvgReport {
  const empty: SvgReport = {
    ok: false,
    error: null,
    title: null,
    widthAttr: null,
    heightAttr: null,
    widthPx: null,
    heightPx: null,
    viewBoxAttr: null,
    viewBox: null,
    aspect: null,
    renderWidth: null,
    renderHeight: null,
    elements: [],
    elementTotal: 0,
    nodeTotal: 0,
    maxDepth: 0,
    scripts: 0,
    eventHandlers: 0,
    embeddedImages: 0,
    linkedImages: 0,
    externalRefs: [],
    styleElements: 0,
    styleAttributes: 0,
    foreignObjects: 0,
    ids: 0,
  };

  if (!source.trim()) {
    return { ...empty, error: 'This file is empty.' };
  }

  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const failure = doc.getElementsByTagName('parsererror')[0];
  if (failure) {
    const detail = (failure.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    return {
      ...empty,
      error: detail
        ? `This file is not valid XML, so it cannot be described: ${detail}`
        : 'This file is not valid XML, so it cannot be described.',
    };
  }

  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== 'svg') {
    return { ...empty, error: 'This file has no <svg> root element, so it is not an SVG image.' };
  }

  const counts = new Map<string, number>();
  const external = new Set<string>();
  let elementTotal = 0;
  let nodeTotal = 0;
  let maxDepth = 0;
  let scripts = 0;
  let eventHandlers = 0;
  let embeddedImages = 0;
  let linkedImages = 0;
  let styleElements = 0;
  let styleAttributes = 0;
  let foreignObjects = 0;
  let ids = 0;

  const visit = (node: Node, depth: number): void => {
    nodeTotal += 1;
    maxDepth = Math.max(maxDepth, depth);
    if (node.nodeType === 1) {
      const el = node as Element;
      const tag = el.localName.toLowerCase();
      elementTotal += 1;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);

      if (tag === 'script') scripts += 1;
      if (tag === 'style') {
        styleElements += 1;
        collectUrls(el.textContent ?? '', external);
      }
      if (tag === 'foreignobject') foreignObjects += 1;
      if (tag === 'image') {
        const href = hrefOf(el);
        if (href && /^data:/i.test(href.trim())) embeddedImages += 1;
        else if (href) linkedImages += 1;
      }

      for (let i = 0; i < el.attributes.length; i += 1) {
        const attr = el.attributes[i];
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) eventHandlers += 1;
        if (name === 'id') ids += 1;
        if (name === 'style') styleAttributes += 1;
        collectUrls(attr.value, external);
      }
    }
    for (let i = 0; i < node.childNodes.length; i += 1) visit(node.childNodes[i], depth + 1);
  };
  visit(root, 1);

  const widthAttr = root.getAttribute('width');
  const heightAttr = root.getAttribute('height');
  const viewBoxAttr = root.getAttribute('viewBox') ?? root.getAttribute('viewbox');
  const viewBox = parseViewBox(viewBoxAttr);
  const widthPx = parseLength(widthAttr)?.px ?? null;
  const heightPx = parseLength(heightAttr)?.px ?? null;
  const renderWidth = widthPx ?? viewBox?.width ?? null;
  const renderHeight = heightPx ?? viewBox?.height ?? null;

  let title: string | null = null;
  for (let i = 0; i < root.childNodes.length; i += 1) {
    const child = root.childNodes[i];
    if (child.nodeType === 1 && (child as Element).localName.toLowerCase() === 'title') {
      title = (child.textContent ?? '').trim() || null;
      break;
    }
  }

  return {
    ok: true,
    error: null,
    title,
    widthAttr,
    heightAttr,
    widthPx,
    heightPx,
    viewBoxAttr,
    viewBox,
    aspect: aspectRatioLabel(renderWidth, renderHeight),
    renderWidth,
    renderHeight,
    elements: [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    elementTotal,
    nodeTotal,
    maxDepth,
    scripts,
    eventHandlers,
    embeddedImages,
    linkedImages,
    externalRefs: [...external].slice(0, 20),
    styleElements,
    styleAttributes,
    foreignObjects,
    ids,
  };
}
