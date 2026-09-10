import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

/** Parameters Tauri injects rather than reading from the JS argument object. */
const INJECTED = new Set(['app', 'window', 'webview', 'state', 'apphandle']);

function camel(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** command name -> the argument keys it accepts, in camelCase. */
function commandParameters(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const dir = join(ROOT, 'src-tauri', 'src', 'cmd');
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.rs')) continue;
    const text = readFileSync(join(dir, entry), 'utf8');
    const re = /#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+([a-z0-9_]+)\s*\(([^)]*)\)/g;
    for (const match of text.matchAll(re)) {
      const name = match[1];
      const params = new Set<string>();
      for (const raw of match[2].split(',')) {
        const piece = raw.trim();
        if (!piece) continue;
        const ident = piece.split(':')[0].trim().replace(/^mut\s+/, '');
        if (!/^[a-z_][a-z0-9_]*$/.test(ident)) continue;
        if (INJECTED.has(ident.toLowerCase())) continue;
        params.add(camel(ident));
      }
      out.set(name, params);
    }
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Read the balanced `{...}` starting at `open`, returning its inner text. */
function balanced(text: string, open: number): string | null {
  if (text[open] !== '{') return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/** Top-level keys of an object literal body, ignoring nested objects. */
function topLevelKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let i = 0;
  let atKeyPosition = true;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) atKeyPosition = true;
    else if (depth === 0 && atKeyPosition && /[A-Za-z_$]/.test(ch)) {
      const rest = body.slice(i);
      const m = rest.match(/^([A-Za-z_$][\w$]*)\s*[:,}\n]/);
      if (m) keys.push(m[1]);
      atKeyPosition = false;
    } else if (depth === 0 && atKeyPosition && !/\s/.test(ch)) {
      atKeyPosition = false;
    }
    i += 1;
  }
  return keys;
}

/**
 * A backend argument name is a plain string on the TypeScript side, so a mismatch
 * between what a tool sends and what the Rust command declares fails only when a
 * user clicks the button — and then fails as an opaque deserialisation error.
 *
 * This walks every `call('cmd', {...})` and `{ command: 'cmd', args: {...} }` in
 * the app and checks the keys against the real Rust signatures.
 */
describe('backend argument names', () => {
  const commands = commandParameters();

  it('parses the Rust command signatures', () => {
    expect(commands.size).toBeGreaterThan(30);
    expect([...(commands.get('process_images') ?? [])].sort()).toEqual(['inputs', 'jobId', 'ops', 'output']);
    expect([...(commands.get('inspect_paths') ?? [])]).toEqual(['paths']);
  });

  it('every call sends only argument names the command declares', () => {
    const files = [...walk(join(ROOT, 'src', 'tools')), ...walk(join(ROOT, 'src', 'core')), ...walk(join(ROOT, 'src', 'components'))];
    const problems: string[] = [];

    for (const file of files) {
      // Test files assert plan objects rather than issuing IPC calls, and their
      // adjacent assertions confuse a look-ahead scanner.
      if (/\.test\.tsx?$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const [name, params] of commands) {
        const needle = new RegExp(`['"\`]${name}['"\`]`, 'g');
        for (const hit of text.matchAll(needle)) {
          const from = (hit.index ?? 0) + hit[0].length;
          // Stop before the next command string so one call cannot borrow the
          // argument object of the next.
          const rest = text.slice(from, from + 600);
          const nextCommand = rest.search(/['"`][a-z][a-z0-9_]{4,}['"`]\s*,\s*\{|command:\s*['"`]/);
          const window = nextCommand > 0 ? rest.slice(0, nextCommand) : rest;

          // `call('cmd', { ... })`
          let body: string | null = null;
          const direct = window.match(/^\s*,\s*\{/);
          if (direct) {
            body = balanced(text, from + direct[0].length - 1 + 0);
          } else {
            // `{ command: 'cmd', ..., args: { ... } }`
            const argsAt = window.indexOf('args:');
            if (argsAt >= 0) {
              const brace = window.indexOf('{', argsAt);
              if (brace >= 0) body = balanced(text, from + brace);
            }
          }
          if (body === null || body.includes('...')) continue;

          for (const key of topLevelKeys(body)) {
            if (!params.has(key)) {
              problems.push(
                `${file.replace(ROOT + '/', '')}: "${name}" does not accept "${key}" (accepts: ${[...params].join(', ') || 'nothing'})`,
              );
            }
          }
        }
      }
    }
    expect([...new Set(problems)], [...new Set(problems)].join('\n')).toEqual([]);
  });
});
