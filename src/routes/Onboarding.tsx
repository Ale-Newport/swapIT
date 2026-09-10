import { useState } from 'react';
import { checkBinaries } from '@/core/bridge';
import { usePrefs } from '@/core/prefs';
import type { BinaryStatus } from '@/core/types';
import { Badge, Button, Icon, Spinner } from '@/components/ui';

export function Onboarding() {
  const setOnboarded = usePrefs((s) => s.setOnboarded);
  const [checking, setChecking] = useState(false);
  const [statuses, setStatuses] = useState<BinaryStatus[] | null>(null);

  const check = async () => {
    setChecking(true);
    try {
      setStatuses(await checkBinaries());
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-canvas p-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-panel">
            <Icon name="Box" size={26} strokeWidth={2} />
          </span>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Welcome to Toolbox</h1>
          <p className="mt-1.5 max-w-sm text-[13px] text-ink-soft">
            Your local toolkit for everyday file tasks.
          </p>
        </div>

        <div className="space-y-2.5 rounded-card border border-line bg-panel p-4">
          {[
            {
              icon: 'ShieldCheck',
              title: 'Everything runs locally',
              body: 'Images, video, audio and documents are processed on this Mac. Nothing is uploaded.',
            },
            {
              icon: 'MousePointerClick',
              title: 'Drop a file, pick an action',
              body: 'Toolbox reads the file type and suggests what you can do with it.',
            },
            {
              icon: 'Command',
              title: 'Press ⌘K for anything',
              body: 'Search every tool by name, format or what it does — no mouse needed.',
            },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-soft">
                <Icon name={item.icon} size={14} />
              </span>
              <div>
                <p className="text-[12.5px] font-medium text-ink">{item.title}</p>
                <p className="text-[11.5px] leading-[1.5] text-ink-faint">{item.body}</p>
              </div>
            </div>
          ))}
        </div>

        {statuses && (
          <div className="mt-3 rounded-card border border-line bg-panel p-4">
            <p className="mb-2 text-[12px] font-medium text-ink">
              Optional helpers ({statuses.filter((s) => s.installed).length} of {statuses.length} found)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((s) => (
                <Badge key={s.id} tone={s.installed ? 'success' : 'neutral'}>
                  <Icon name={s.installed ? 'Check' : 'Minus'} size={10} />
                  {s.label}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-ink-faint">
              Missing ones only affect the tools that need them. You can install them any time from Settings ›
              Advanced.
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-center gap-2">
          <Button variant="primary" size="lg" onClick={() => setOnboarded(true)}>
            Get started
          </Button>
          <Button size="lg" onClick={() => void check()} disabled={checking}>
            {checking ? <Spinner /> : <Icon name="Terminal" size={15} />}
            Check dependencies
          </Button>
        </div>
      </div>
    </div>
  );
}
