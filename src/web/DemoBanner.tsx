import { useState } from 'react';
import { RELEASES_URL } from './demoIpc';

/** A small, dismissible note that this is the browser demo, with the way to the real app. */
export function DemoBanner() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div
      role="note"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-panel/95 py-1.5 pl-4 pr-1.5 text-[12.5px] text-ink-soft shadow-lg backdrop-blur"
    >
      <span className="min-w-0 truncate">
        <strong className="font-semibold text-ink">Web demo.</strong> Text, developer, QR, SVG and generator tools run
        here; file tools need the Mac app.
      </span>
      <a
        href={RELEASES_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-accent px-3 py-1 font-medium text-white hover:opacity-90"
      >
        Download for macOS
      </a>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setOpen(false)}
        className="shrink-0 rounded-full px-2 py-1 text-ink-faint hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
