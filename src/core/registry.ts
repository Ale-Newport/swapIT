import Fuse from 'fuse.js';
import type { AcceptSpec, CategoryId, FileInfo, FileKind, ToolDefinition } from './types';

/**
 * Identity helper so tool modules get type checking without importing the type.
 * Every tool folder contains a `tool.ts` exporting `defineTool({...})` as default.
 */
export function defineTool(tool: ToolDefinition): ToolDefinition {
  return tool;
}

const registry = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  if (registry.has(tool.id)) {
    // A duplicate id would make one of the two unreachable — fail loudly in dev.
    if (import.meta.env.DEV) {
      throw new Error(`Duplicate tool id "${tool.id}". Tool ids must be unique.`);
    }
    return;
  }
  registry.set(tool.id, tool);
}

/**
 * Tools register themselves: every `src/tools/**\/tool.ts` is picked up at build
 * time, so adding a tool never means editing a shared index file. Only the small
 * metadata module is eager — the React component behind `load()` is code-split.
 */
const modules = import.meta.glob<{ default: ToolDefinition }>('../tools/**/tool.ts', { eager: true });

let loaded = false;

export function loadRegistry(): void {
  if (loaded) return;
  loaded = true;
  for (const [path, mod] of Object.entries(modules)) {
    const tool = mod?.default;
    if (!tool || typeof tool.id !== 'string') {
      console.warn(`[toolbox] ${path} does not default-export a tool definition.`);
      continue;
    }
    registerTool(tool);
  }
}

loadRegistry();

export function allTools(): ToolDefinition[] {
  return [...registry.values()];
}

export function visibleTools(): ToolDefinition[] {
  return allTools().filter((t) => !t.hidden);
}

export function getTool(id: string): ToolDefinition | undefined {
  return registry.get(id);
}

export function toolsByCategory(category: CategoryId): ToolDefinition[] {
  return visibleTools()
    .filter((t) => t.category === category)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.name.localeCompare(b.name));
}

export function categoryCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tool of visibleTools()) {
    counts[tool.category] = (counts[tool.category] ?? 0) + 1;
  }
  return counts;
}

// ------------------------------------------------------------------ search

interface IndexedTool extends ToolDefinition {
  searchText: string;
  categoryName: string;
}

let fuse: Fuse<IndexedTool> | null = null;

function buildIndex(): Fuse<IndexedTool> {
  if (fuse) return fuse;
  const items: IndexedTool[] = visibleTools().map((tool) => ({
    ...tool,
    categoryName: tool.category,
    searchText: [
      tool.name,
      tool.description,
      tool.category,
      ...(tool.keywords ?? []),
      ...(tool.produces ?? []),
      ...(tool.accepts?.extensions ?? []),
    ].join(' '),
  }));
  fuse = new Fuse(items, {
    keys: [
      { name: 'name', weight: 3 },
      { name: 'keywords', weight: 2.5 },
      { name: 'description', weight: 1.2 },
      { name: 'searchText', weight: 1 },
      { name: 'categoryName', weight: 0.6 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
    useExtendedSearch: false,
  });
  return fuse;
}

export function searchTools(query: string, limit = 40): ToolDefinition[] {
  const q = query.trim();
  if (!q) return [];
  return buildIndex()
    .search(q, { limit })
    .map((r) => r.item as ToolDefinition);
}

// ------------------------------------------------------------------ matching

function acceptsExtension(accept: AcceptSpec | undefined, ext: string, kind: FileKind): boolean {
  if (!accept) return false;
  if (accept.extensions?.length) {
    if (accept.extensions.some((e) => e.replace(/^\./, '').toLowerCase() === ext)) return true;
  }
  if (accept.kinds?.length) {
    if (accept.kinds.includes(kind)) return true;
  }
  return false;
}

/** Tools that can act on a dropped file, best matches first. */
export function toolsForFile(file: Pick<FileInfo, 'extension' | 'kind' | 'isDir'>): ToolDefinition[] {
  const ext = file.extension.toLowerCase();
  const scored: Array<{ tool: ToolDefinition; score: number }> = [];
  for (const tool of visibleTools()) {
    if (!tool.accepts) continue;
    if (file.isDir) {
      if (tool.accepts.folders) scored.push({ tool, score: 10 + (tool.weight ?? 0) / 100 });
      continue;
    }
    const hasExtensions = Boolean(tool.accepts.extensions?.length);
    const hasKinds = Boolean(tool.accepts.kinds?.length);
    // A tool declaring only `folders` is not offered for a file.
    if (tool.accepts.folders && !hasExtensions && !hasKinds) continue;
    const exactExt = tool.accepts.extensions?.some((e) => e.replace(/^\./, '').toLowerCase() === ext) ?? false;
    const kindMatch = tool.accepts.kinds?.includes(file.kind) ?? false;
    if (!hasExtensions && !hasKinds) {
      // `accepts: {}` means "any file" — the universal converter and the file
      // utilities. Offered, but always below a tool built for this exact type.
      scored.push({ tool, score: 10 + (tool.weight ?? 0) / 100 });
      continue;
    }
    if (!exactExt && !kindMatch) continue;
    scored.push({ tool, score: (exactExt ? 100 : 50) + (tool.weight ?? 0) / 100 });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.tool);
}

/** Tools that can act on every file in a mixed selection. */
export function toolsForFiles(files: Array<Pick<FileInfo, 'extension' | 'kind' | 'isDir'>>): ToolDefinition[] {
  if (files.length === 0) return [];
  if (files.length === 1) return toolsForFile(files[0]);
  const lists = files.map((f) => new Set(toolsForFile(f).map((t) => t.id)));
  const common = toolsForFile(files[0]).filter((t) => lists.every((set) => set.has(t.id)));
  return common.filter((t) => t.accepts?.multiple !== false);
}

export { acceptsExtension };
