import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useLocation } from 'react-router-dom';
import { Marked } from 'marked';
import { useDropTarget } from '@/core/dnd';
import { Alert, Button, CopyButton, IconButton, Segmented, Textarea } from '@/components/ui';
import { sanitizeHtml } from './logic';

const SAMPLE = `# Markdown Preview

Everything here is rendered **locally** — nothing leaves your Mac.

## What it handles

- Lists, *emphasis* and \`inline code\`
- [Links](https://example.com) that open in your browser
- Tables:

| Tool | Category | Offline |
| --- | --- | :-: |
| Image Converter | Images | yes |
| CSV Viewer | Text | yes |

> Blockquotes, horizontal rules and fenced code too.

\`\`\`ts
const greeting = 'hello';
console.log(greeting);
\`\`\`

---

Raw HTML such as \`<script>\` tags is stripped before anything is displayed.
`;

/** Compact prose styling for the rendered pane, built only from design tokens. */
const PROSE_CSS = `
.md-prose { color: var(--color-ink); font-size: 13.5px; line-height: 1.65; word-wrap: break-word; }
.md-prose > :first-child { margin-top: 0; }
.md-prose > :last-child { margin-bottom: 0; }
.md-prose p { margin: 0.7em 0; }
.md-prose h1, .md-prose h2, .md-prose h3, .md-prose h4, .md-prose h5, .md-prose h6 {
  margin: 1.4em 0 0.5em; font-weight: 640; line-height: 1.3; letter-spacing: -0.01em; color: var(--color-ink);
}
.md-prose h1 { font-size: 20px; }
.md-prose h2 { font-size: 17px; padding-bottom: 0.25em; border-bottom: 1px solid var(--color-line); }
.md-prose h3 { font-size: 15px; }
.md-prose h4, .md-prose h5, .md-prose h6 { font-size: 13.5px; }
.md-prose a { color: var(--color-accent); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.md-prose ul, .md-prose ol { margin: 0.6em 0; padding-left: 1.4em; }
.md-prose li { margin: 0.2em 0; }
.md-prose li > p { margin: 0.3em 0; }
.md-prose blockquote {
  margin: 1em 0; padding: 0 0 0 12px; color: var(--color-ink-soft);
  border-left: 3px solid var(--color-line-strong);
}
.md-prose code {
  font-family: var(--font-mono); font-size: 0.88em; padding: 0.12em 0.35em;
  background: var(--color-canvas); border: 1px solid var(--color-line); border-radius: 4px;
}
.md-prose pre {
  margin: 0.9em 0; padding: 10px 12px; overflow-x: auto; border-radius: 8px;
  background: var(--color-canvas); border: 1px solid var(--color-line);
}
.md-prose pre code { padding: 0; background: none; border: 0; font-size: 12px; line-height: 1.6; }
.md-prose table { border-collapse: collapse; margin: 0.9em 0; font-size: 12.5px; }
.md-prose th, .md-prose td { border: 1px solid var(--color-line); padding: 4px 9px; text-align: left; }
.md-prose th { background: var(--color-canvas); font-weight: 600; }
.md-prose img { max-width: 100%; border-radius: 6px; }
.md-prose hr { margin: 1.5em 0; border: 0; border-top: 1px solid var(--color-line); }
.md-prose kbd {
  font-family: var(--font-mono); font-size: 0.85em; padding: 0.1em 0.35em;
  border: 1px solid var(--color-line-strong); border-radius: 4px; background: var(--color-canvas);
}
`;

export default function MarkdownPreview() {
  const [markdown, setMarkdown] = useState('');
  const [pane, setPane] = useState<'preview' | 'html'>('preview');
  const [fileError, setFileError] = useState<string | null>(null);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  /** The generated-HTML pane replaces the preview pane, so it syncs the same way. */
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const scrolling = useRef<'editor' | 'preview' | null>(null);

  const marked = useMemo(() => new Marked({ gfm: true, breaks: false }), []);

  const rendered = useMemo(() => {
    if (!markdown.trim()) return { html: '', error: null as string | null };
    try {
      const raw = marked.parse(markdown, { async: false });
      return { html: sanitizeHtml(raw), error: null };
    } catch (err) {
      return { html: '', error: err instanceof Error ? err.message : String(err) };
    }
  }, [markdown, marked]);

  const loadFile = useCallback(async (path: string) => {
    try {
      setMarkdown(await readTextFile(path));
      setFileError(null);
    } catch {
      setFileError('That file could not be read as text.');
    }
  }, []);

  const { ref: dropRef, isOver } = useDropTarget(
    (paths) => {
      if (paths[0]) void loadFile(paths[0]);
    },
    { priority: 6 },
  );

  // Files handed over by the Home quick actions.
  const location = useLocation();
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    const incoming = (location.state as { files?: string[] } | null)?.files;
    const first = incoming?.[0];
    if (!first || consumed.current === first) return;
    consumed.current = first;
    void loadFile(first);
  }, [location.state, loadFile]);

  /** Keep both panes at the same relative position without fighting each other. */
  const sync = (from: 'editor' | 'preview') => {
    if (scrolling.current && scrolling.current !== from) return;
    // Whichever of the two right-hand panes is mounted plays the "preview" side.
    const other: HTMLElement | null = previewRef.current ?? htmlRef.current;
    const source = from === 'editor' ? editorRef.current : other;
    const target = from === 'editor' ? other : editorRef.current;
    if (!source || !target) return;
    const sourceMax = source.scrollHeight - source.clientHeight;
    const targetMax = target.scrollHeight - target.clientHeight;
    if (sourceMax <= 4 || targetMax <= 4) return;
    scrolling.current = from;
    target.scrollTop = (source.scrollTop / sourceMax) * targetMax;
    requestAnimationFrame(() => {
      scrolling.current = null;
    });
  };

  const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-4">
      <style>{PROSE_CSS}</style>

      {fileError && <Alert tone="danger">{fileError}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-medium text-ink-soft">Markdown</label>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setMarkdown(SAMPLE)}>
                Sample
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="ClipboardPaste"
                onClick={async () => {
                  try {
                    setMarkdown(await navigator.clipboard.readText());
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
              >
                Paste
              </Button>
              <IconButton icon="X" label="Clear markdown" size="sm" onClick={() => setMarkdown('')} />
            </div>
          </div>
          <div ref={dropRef} className={isOver ? 'rounded-lg ring-2 ring-accent/40' : ''}>
            <Textarea
              ref={editorRef}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              onScroll={() => sync('editor')}
              placeholder={isOver ? 'Release to load this file' : '# Heading\n\nWrite Markdown here, or drop a .md file.'}
              className="h-[560px] w-full resize-none"
            />
          </div>
          <p className="text-[11px] text-ink-faint">
            {markdown.split('\n').length.toLocaleString()} lines · {words.toLocaleString()} words · drop a .md file to
            load it
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Segmented
              value={pane}
              onChange={setPane}
              size="sm"
              options={[
                { value: 'preview', label: 'Preview' },
                { value: 'html', label: 'HTML' },
              ]}
            />
            <CopyButton
              value={() => rendered.html}
              label="Copy HTML"
              size="sm"
              variant="ghost"
              disabled={!rendered.html}
            />
          </div>

          {rendered.error ? (
            <Alert tone="danger" title="This Markdown could not be rendered">
              {rendered.error}
            </Alert>
          ) : pane === 'preview' ? (
            <div
              ref={previewRef}
              onScroll={() => sync('preview')}
              onClick={(event) => {
                const anchor = (event.target as HTMLElement).closest('a');
                const href = anchor?.getAttribute('href');
                if (!href) return;
                event.preventDefault();
                if (/^(https?|mailto|tel):/i.test(href)) void openUrl(href);
              }}
              className="md-prose selectable h-[560px] overflow-auto rounded-lg border border-line bg-panel px-4 py-3"
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          ) : (
            <Textarea
              ref={htmlRef}
              value={rendered.html}
              readOnly
              onScroll={() => sync('preview')}
              className="h-[560px] w-full resize-none bg-canvas"
              placeholder="The generated HTML appears here"
            />
          )}
          <p className="text-[11px] text-ink-faint">
            {rendered.html.length.toLocaleString()} characters of sanitised HTML · scripts, styles and
            javascript: links are removed
          </p>
        </div>
      </div>
    </div>
  );
}
