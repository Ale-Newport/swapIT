import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';

const ROOT = join(import.meta.dirname, '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && entry !== 'icons.ts') out.push(full);
  }
  return out;
}

/**
 * Icons are looked up by name at runtime, so a typo or a name missing from the
 * curated bundle renders a blank square with no error. This test makes that a
 * build-time failure instead — run `node scripts/generate-icons.mjs` to fix.
 */
describe('icon map', () => {
  it('contains every icon name the app references', () => {
    const files = walk(join(ROOT, 'src'));
    const missing = new Set<string>();
    const patterns = [
      /<Icon\s[^>]*name=\{?['"]([A-Z][A-Za-z0-9]*)['"]/g,
      /\bicon:\s*['"]([A-Z][A-Za-z0-9]*)['"]/g,
      /\bicon=\{?['"]([A-Z][A-Za-z0-9]*)['"]/g,
      /\biconRight=['"]([A-Z][A-Za-z0-9]*)['"]/g,
    ];
    for (const file of files) {
      if (file.endsWith('icons.test.ts')) continue;
      const text = readFileSync(file, 'utf8');
      for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
          if (!(match[1] in ICONS)) missing.add(`${match[1]} (${file.replace(ROOT + '/', '')})`);
        }
      }
    }
    expect(
      [...missing],
      `Missing icons — run: node scripts/generate-icons.mjs\n${[...missing].join('\n')}`,
    ).toEqual([]);
  });

  it('bundles a curated subset rather than all of lucide', () => {
    const count = Object.keys(ICONS).length;
    expect(count).toBeGreaterThan(50);
    expect(count, 'the whole lucide set would bloat the startup chunk').toBeLessThan(1200);
  });
});
