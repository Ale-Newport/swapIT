import { useEffect, useMemo, useRef, useState } from 'react';
import { openPath } from '@/core/bridge';
import { createTextFile } from '@/core/quick';
import { Icon } from '@/components/ui';
import { FILE_TYPES, fileType, titleFromContent, type NewFileType } from '../catalog/fileTypes';
import { closeRadial, finishWith } from '../runner';
import { radial } from '../store';
import { folderName } from '../system';

const OPEN_KEY = 'toolbox.radial.openAfterCreate';

function readOpenAfter(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * "New text file", "New Markdown note", "New folder": a glass sheet with a name,
 * a body to type into and ⌘↵ to save. The name follows the first line unless you
 * type one, so a note called "# Meeting with Ana" is saved as "Meeting with Ana.md".
 */
export function NewFileCard({ typeId, folder }: { typeId: string; folder: string }) {
  const initial = fileType(typeId);
  const [type, setType] = useState<NewFileType>(initial);
  const [name, setName] = useState('');
  const [content, setContent] = useState(() => initial.template({ title: '', date: new Date() }));
  const [variant, setVariant] = useState('blank');
  const [openAfter, setOpenAfter] = useState(readOpenAfter);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const touchedContent = useRef(false);

  useEffect(() => {
    // Start typing straight away: the name follows what you write.
    bodyRef.current?.focus();
    if (bodyRef.current) {
      const end = bodyRef.current.value.length;
      bodyRef.current.setSelectionRange(end, end);
    }
  }, []);

  const derived = useMemo(() => titleFromContent(content), [content]);
  const finalName = (name.trim() || derived || 'Untitled').trim();

  const pickType = (next: NewFileType) => {
    const previousStarter = type.template({ title: '', date: new Date() });
    // Only replace the body if you have not written anything of your own.
    if (!touchedContent.current || content === previousStarter || content.trim() === '') {
      setContent(next.template({ title: name.trim(), date: new Date() }));
      touchedContent.current = false;
    }
    setType(next);
    setVariant('blank');
    bodyRef.current?.focus();
  };

  const pickVariant = (id: string) => {
    const found = type.variants?.find((v) => v.id === id);
    if (!found) return;
    setVariant(id);
    setContent(found.template({ title: name.trim() || derived, date: new Date() }));
    touchedContent.current = false;
    bodyRef.current?.focus();
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      localStorage.setItem(OPEN_KEY, openAfter ? '1' : '0');
    } catch {
      /* a preference, not a requirement */
    }
    await finishWith(`Creating ${finalName}.${type.ext}`, async () => {
      const made = await createTextFile({
        dir: folder,
        name: finalName,
        ext: type.ext,
        content,
        executable: type.executable,
      });
      if (openAfter) await openPath(made.path);
      return { title: made.name, detail: `Saved in ${folderName(folder)}`, results: [made] };
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void create();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeRadial();
    } else if (e.key === 'Tab' && document.activeElement === nameRef.current && !e.shiftKey) {
      e.preventDefault();
      bodyRef.current?.focus();
    }
  };

  return (
    <div className="rg-panel rg-card" onKeyDown={onKeyDown}>
      <div className="rg-card-body">
        <div className="rg-card-head">
          <span className="rg-card-badge">
            <Icon name={type.icon} size={17} />
          </span>
          <div className="rg-card-headtext">
            <div className="rg-card-title">
              {type.id === 'md' ? 'New Markdown note' : type.id === 'txt' ? 'New text file' : `New ${type.label} file`}
            </div>
            <div className="rg-card-sub">
              In <b>{folderName(folder)}</b>
            </div>
          </div>
          <button type="button" className="rg-icon-btn" aria-label="Close" onClick={() => closeRadial()}>
            <Icon name="X" size={13} />
          </button>
        </div>

        <div className="rg-chips" role="tablist" aria-label="File type">
          {FILE_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="rg-chip"
              data-on={t.id === type.id}
              aria-selected={t.id === type.id}
              onClick={() => pickType(t)}
            >
              {t.glyph}
            </button>
          ))}
        </div>

        <div className="rg-name">
          <input
            ref={nameRef}
            className="rg-field"
            placeholder={derived || 'Untitled'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
            aria-label="File name"
          />
          <span className="rg-ext">.{type.ext}</span>
        </div>

        {type.variants && (
          <div className="rg-chips rg-chips-sub" aria-label="Template">
            {type.variants.map((v) => (
              <button key={v.id} type="button" className="rg-chip" data-on={variant === v.id} onClick={() => pickVariant(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={bodyRef}
          className="rg-field rg-mono rg-body"
          placeholder={type.placeholder}
          value={content}
          onChange={(e) => {
            touchedContent.current = true;
            setContent(e.target.value);
          }}
          spellCheck={type.id === 'txt' || type.id === 'md'}
          aria-label="Contents"
        />

        <div className="rg-card-foot">
          <label className="rg-check-row">
            <input type="checkbox" checked={openAfter} onChange={(e) => setOpenAfter(e.target.checked)} />
            Open after creating
          </label>
          <div className="rg-card-buttons">
            <button type="button" className="rg-btn" onClick={() => closeRadial()}>
              Cancel
            </button>
            <button type="button" className="rg-btn" data-primary="true" disabled={busy} onClick={() => void create()}>
              Create <span className="rg-kbd">⌘↵</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Where a card puts things when Finder gave no folder. */
export function cardFolder(): string {
  return radial.get().folder ?? '';
}
