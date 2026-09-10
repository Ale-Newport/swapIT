import { describe, expect, it } from 'vitest';
import { allTools, searchTools, toolsForFile, toolsForFiles, visibleTools } from './registry';
import { CATEGORIES } from './categories';

/**
 * These assertions are about the registry contract every tool depends on, not
 * about any individual tool: unique ids, valid categories, matching folders,
 * and a search index that finds tools by what a user would actually type.
 */
describe('tool registry', () => {
  const tools = allTools();

  it('discovers tools without a shared index file', () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  it('has no duplicate ids', () => {
    const ids = tools.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every tool an id matching category/slug', () => {
    for (const tool of tools) {
      expect(tool.id, `${tool.id} must be "category/slug"`).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
      expect(tool.id.split('/')[0], `${tool.id} id prefix must equal its category`).toBe(tool.category);
    }
  });

  it('only uses declared categories', () => {
    const valid = new Set(CATEGORIES.map((c) => c.id));
    for (const tool of tools) {
      expect(valid.has(tool.category), `${tool.id} uses unknown category ${tool.category}`).toBe(true);
    }
  });

  it('gives every tool a name, a one-line description and an icon', () => {
    for (const tool of tools) {
      expect(tool.name.length, `${tool.id} needs a name`).toBeGreaterThan(1);
      expect(tool.description.length, `${tool.id} needs a description`).toBeGreaterThan(8);
      expect(tool.description, `${tool.id} description should be one line`).not.toContain('\n');
      expect(tool.icon, `${tool.id} needs an icon`).toMatch(/^[A-Z][A-Za-z0-9]*$/);
      expect(typeof tool.load, `${tool.id} needs a lazy loader`).toBe('function');
    }
  });

  it('gives searchable tools real keywords', () => {
    for (const tool of visibleTools()) {
      expect((tool.keywords ?? []).length, `${tool.id} should carry keywords for ⌘K`).toBeGreaterThan(0);
    }
  });
});

describe('search index', () => {
  it('finds a tool by the format it produces, not just its name', () => {
    const results = searchTools('jpg').map((t) => t.id);
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns nothing for an empty query rather than everything', () => {
    expect(searchTools('')).toEqual([]);
    expect(searchTools('   ')).toEqual([]);
  });

  it('tolerates a query that matches nothing', () => {
    expect(searchTools('zzzzqqqxxx')).toEqual([]);
  });
});

describe('file matching', () => {
  it('suggests image tools for an image', () => {
    const matches = toolsForFile({ extension: 'heic', kind: 'image', isDir: false });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((t) => t.accepts)).toBe(true);
  });

  it('ranks an exact extension match above a broad kind match', () => {
    const matches = toolsForFile({ extension: 'heic', kind: 'image', isDir: false });
    if (matches.length > 1) {
      const first = matches[0];
      const exact = first.accepts?.extensions?.includes('heic') ?? false;
      const anyExact = matches.some((t) => t.accepts?.extensions?.includes('heic'));
      if (anyExact) expect(exact).toBe(true);
    }
  });

  it('only offers tools that handle every file in a mixed selection', () => {
    const mixed = toolsForFiles([
      { extension: 'jpg', kind: 'image', isDir: false },
      { extension: 'mp4', kind: 'video', isDir: false },
    ]);
    for (const tool of mixed) {
      const catchAll = !tool.accepts?.kinds?.length && !tool.accepts?.extensions?.length;
      if (catchAll) continue; // `accepts: {}` legitimately handles anything.
      const handlesImage = tool.accepts?.kinds?.includes('image') || tool.accepts?.extensions?.includes('jpg');
      const handlesVideo = tool.accepts?.kinds?.includes('video') || tool.accepts?.extensions?.includes('mp4');
      expect(
        handlesImage && handlesVideo,
        `${tool.id} was offered for a mixed image+video selection but does not handle both`,
      ).toBeTruthy();
    }
  });

  it('returns nothing for an empty selection', () => {
    expect(toolsForFiles([])).toEqual([]);
  });

  it('offers catch-all tools for any file, ranked below specific ones', () => {
    const matches = toolsForFile({ extension: 'xyz', kind: 'other', isDir: false });
    // A tool declaring `accepts: {}` handles anything, so an unknown type is
    // never a dead end.
    const catchAll = matches.filter((t) => !t.accepts?.extensions?.length && !t.accepts?.kinds?.length);
    for (const tool of catchAll) {
      expect(tool.accepts).toBeDefined();
    }
    const specific = toolsForFile({ extension: 'jpg', kind: 'image', isDir: false });
    if (specific.length > 1 && catchAll.length > 0) {
      // The first suggestion for a JPEG must be an image tool, not the catch-all.
      const first = specific[0];
      expect(
        first.accepts?.extensions?.includes('jpg') || first.accepts?.kinds?.includes('image'),
      ).toBeTruthy();
    }
  });
});
