// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { allTools } from './registry';

/**
 * A smoke test across the entire tool library: every registered tool must have a
 * component module that actually resolves and default-exports something
 * renderable. This is what catches a broken import path, a typo in `load()`, or
 * a module that touches `document` at import time — across all tools at once,
 * without needing to open each one in the app.
 */
describe('every registered tool loads', () => {
  const tools = allTools();

  it.each(tools.map((t) => [t.id, t] as const))('%s resolves its component', async (_id, tool) => {
    const mod = await tool.load();
    expect(mod, `${tool.id}: load() resolved to nothing`).toBeTruthy();
    expect(typeof mod.default, `${tool.id}: ui.tsx must have a default export`).toBe('function');
  });
});
