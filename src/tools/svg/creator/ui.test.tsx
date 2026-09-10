// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';

// The drop-zone's context menu pulls in the whole tool registry, which eagerly
// globs every tool in the repo. Stub it so this test only depends on this tool.
vi.mock('@/components/QuickActionMenu', () => ({
  QuickActionMenu: () => null,
  useQuickActionMenu: () => ({ file: null, position: null, openFor: () => undefined, close: () => undefined }),
}));
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Creator from './ui';

beforeAll(() => {
  globalThis.URL.createObjectURL = () => 'blob:test';
  globalThis.URL.revokeObjectURL = () => undefined;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.setPointerCapture = () => undefined;
  proto.releasePointerCapture = () => undefined;
  proto.hasPointerCapture = () => false;
});

function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

describe('the creator canvas responds to pointer input', () => {
  it('draws a rectangle, keeps it in the exported markup, and undoes it', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Creator />
        </MemoryRouter>,
      );
    });

    const svgs = [...host.querySelectorAll('svg[viewBox="0 0 800 600"]')] as SVGSVGElement[];
    const overlay = svgs[1];
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });

    await act(async () => {
      overlay.dispatchEvent(pointer('pointerdown', 104, 96));
    });
    await act(async () => {
      overlay.dispatchEvent(pointer('pointermove', 302, 248));
    });
    await act(async () => {
      overlay.dispatchEvent(pointer('pointerup', 302, 248));
    });

    const drawn = svgs[0].querySelector('rect:not([width="800"])') as SVGRectElement | null;
    expect(drawn).not.toBeNull();
    expect(drawn?.getAttribute('x')).toBe('100');
    expect(drawn?.getAttribute('y')).toBe('100');
    expect(drawn?.getAttribute('width')).toBe('200');
    expect(drawn?.getAttribute('height')).toBe('150');

    // The layer list picked it up, and the tool fell back to Select.
    expect(host.textContent).toContain('Rectangle');

    // Undo puts the canvas back.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    });
    expect(svgs[0].querySelector('rect:not([width="800"])')).toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true }));
    });
    expect(svgs[0].querySelector('rect:not([width="800"])')).not.toBeNull();

    // What export writes out: no editor chrome, no class or style attribute.
    const clone = svgs[0].cloneNode(true) as SVGSVGElement;
    clone.removeAttribute('class');
    clone.removeAttribute('style');
    const xml = new XMLSerializer().serializeToString(clone);
    expect(xml).toContain('<svg');
    expect(xml).toContain('http://www.w3.org/2000/svg');
    expect(xml).not.toContain('class=');
    expect(xml).not.toContain('cursor');
    expect(xml).toContain('width="200"');

    await act(async () => root.unmount());
    host.remove();
  });

  it('selects a shape, drags it and deletes it', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Creator />
        </MemoryRouter>,
      );
    });

    const svgs = [...host.querySelectorAll('svg[viewBox="0 0 800 600"]')] as SVGSVGElement[];
    const [canvas, overlay] = svgs;
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });

    for (const [type, x, y] of [
      ['pointerdown', 100, 100],
      ['pointermove', 300, 250],
      ['pointerup', 300, 250],
    ] as const) {
      await act(async () => {
        overlay.dispatchEvent(pointer(type, x, y));
      });
    }

    // Clicking the invisible twin in the overlay selects the shape.
    const proxy = overlay.querySelector('rect[fill="transparent"]') as SVGRectElement;
    expect(proxy).not.toBeNull();
    await act(async () => {
      proxy.dispatchEvent(pointer('pointerdown', 200, 180));
    });

    // A dashed selection box and four corner handles appear.
    expect(overlay.querySelectorAll('rect[stroke-dasharray]').length).toBe(1);
    expect(overlay.querySelectorAll('rect[rx]').length).toBeGreaterThanOrEqual(4);

    await act(async () => {
      overlay.dispatchEvent(pointer('pointermove', 250, 230));
    });
    await act(async () => {
      overlay.dispatchEvent(pointer('pointerup', 250, 230));
    });

    const moved = canvas.querySelector('rect:not([width="800"])');
    expect(moved?.getAttribute('x')).toBe('150');
    expect(moved?.getAttribute('y')).toBe('150');
    expect(moved?.getAttribute('width')).toBe('200');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });
    expect(canvas.querySelector('rect:not([width="800"])')).toBeNull();
    expect(host.textContent).toContain('Shapes appear here as you draw them.');

    await act(async () => root.unmount());
    host.remove();
  });
});
