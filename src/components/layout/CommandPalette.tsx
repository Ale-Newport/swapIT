import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORIES, categoryName } from '@/core/categories';
import { usePrefs, popularToolIds } from '@/core/prefs';
import { getTool, searchTools, visibleTools } from '@/core/registry';
import type { ToolDefinition } from '@/core/types';
import { Icon, Kbd } from '@/components/ui';
import { isTauri, radialShow } from '@/radial/native';

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  section: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const favorites = usePrefs((s) => s.favorites);
  const recent = usePrefs((s) => s.recent);
  const usage = usePrefs((s) => s.usage);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      // Focus after paint so the caret lands in the field.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const toItem = (tool: ToolDefinition, section: string): Item => ({
      id: tool.id,
      label: tool.name,
      hint: tool.description,
      icon: tool.icon,
      section,
      run: () => navigate(`/t/${tool.id}`),
    });

    if (query.trim()) {
      const results = searchTools(query, 30).map((t) => toItem(t, categoryName(t.category)));
      const q = query.trim().toLowerCase();
      const categoryMatches = CATEGORIES.filter((c) => c.name.toLowerCase().includes(q)).map((c) => ({
        id: `cat:${c.id}`,
        label: c.name,
        hint: c.description,
        icon: c.icon,
        section: 'Categories',
        run: () => navigate(`/c/${c.id}`),
      }));
      const ring = (intent: string) => () => void radialShow({ paths: [], trigger: 'app', intent });
      const actions: Array<Item & { words: string }> = isTauri()
        ? [
            { id: 'do:text', label: 'New text file', hint: 'Create a .txt in the front Finder folder', icon: 'FileText', section: 'Create', run: ring('create:text'), words: 'new text file txt create nuevo archivo texto' },
            { id: 'do:md', label: 'New Markdown note', hint: 'Create a .md note', icon: 'FileCode2', section: 'Create', run: ring('create:markdown'), words: 'new markdown note md create nota nuevo' },
            { id: 'do:record', label: 'Record audio', hint: 'Voice memo saved as .m4a', icon: 'Mic', section: 'Create', run: ring('record'), words: 'record audio voice microphone memo grabar voz micrófono' },
            { id: 'do:ring', label: 'Open the radial menu', hint: 'The ring of one-click actions', icon: 'Orbit', section: 'Create', run: ring('ring'), words: 'radial menu ring donut circle anillo menú' },
          ].filter((a) => `${a.label} ${a.words}`.toLowerCase().includes(q))
        : [];
      const nav: Item[] = [
        { id: 'nav:radial', label: 'Radial menu settings', icon: 'Orbit', section: 'Go to', run: () => navigate('/radial') },
        { id: 'nav:settings', label: 'Settings', icon: 'Settings', section: 'Go to', run: () => navigate('/settings') },
        { id: 'nav:home', label: 'Home', icon: 'House', section: 'Go to', run: () => navigate('/') },
        { id: 'nav:favorites', label: 'Favorites', icon: 'Star', section: 'Go to', run: () => navigate('/favorites') },
      ].filter((n) => n.label.toLowerCase().includes(q));
      return [...actions, ...results, ...categoryMatches, ...nav];
    }

    const favTools = favorites.map((id) => getTool(id)).filter((t): t is ToolDefinition => Boolean(t));
    const recentTools = recent
      .map((id) => getTool(id))
      .filter((t): t is ToolDefinition => Boolean(t))
      .filter((t) => !favorites.includes(t.id))
      .slice(0, 6);
    const popular = popularToolIds(usage, 20)
      .map((id) => getTool(id))
      .filter((t): t is ToolDefinition => Boolean(t))
      .filter((t) => !favorites.includes(t.id) && !recent.slice(0, 6).includes(t.id))
      .slice(0, 5);
    const suggestions =
      favTools.length + recentTools.length + popular.length > 0
        ? []
        : visibleTools()
            .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
            .slice(0, 8);

    return [
      ...favTools.map((t) => toItem(t, 'Favorites')),
      ...recentTools.map((t) => toItem(t, 'Recent')),
      ...popular.map((t) => toItem(t, 'Frequently used')),
      ...suggestions.map((t) => toItem(t, 'Suggested')),
    ];
  }, [query, navigate, favorites, recent, usage]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [index, open]);

  if (!open) return null;

  // Results stay in relevance order, so the same section heading can legitimately
  // appear in more than one run — group consecutive runs and key them by position.
  const grouped: Array<{ section: string; key: string; items: Array<Item & { flatIndex: number }> }> = [];
  items.forEach((item, flatIndex) => {
    const last = grouped[grouped.length - 1];
    if (last && last.section === item.section) last.items.push({ ...item, flatIndex });
    else grouped.push({ section: item.section, key: `${item.section}:${flatIndex}`, items: [{ ...item, flatIndex }] });
  });

  const choose = (item: Item) => {
    item.run();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6 pt-[10vh]">
      <div className="fixed inset-0 bg-black/25" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="animate-pop relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Icon name="Search" size={16} className="shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => (items.length ? (i + 1) % items.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = items[index];
                if (item) choose(item);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Search tools, formats or actions…"
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            spellCheck={false}
            autoComplete="off"
          />
          <Kbd>esc</Kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13px] text-ink-soft">No tools match “{query}”.</p>
              <p className="mt-1 text-[12px] text-ink-faint">Try a format name like “heic”, “mp3” or “json”.</p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.key} className="mb-1">
                <p className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                  {group.section}
                </p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    data-index={item.flatIndex}
                    type="button"
                    onMouseMove={() => setIndex(item.flatIndex)}
                    onClick={() => choose(item)}
                    className={clsx(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      item.flatIndex === index ? 'bg-ink/8' : 'hover:bg-ink/4',
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-canvas text-ink-soft">
                      <Icon name={item.icon} size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{item.label}</span>
                      {item.hint && <span className="block truncate text-[11.5px] text-ink-faint">{item.hint}</span>}
                    </span>
                    {item.flatIndex === index && <Kbd>↵</Kbd>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-[11px] text-ink-faint">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>O</Kbd> open a file
          </span>
          <span className="ml-auto">{items.length} result{items.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
