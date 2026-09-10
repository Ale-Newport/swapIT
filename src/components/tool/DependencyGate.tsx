import { useEffect, useState } from 'react';
import { checkBinary, installInstructions } from '@/core/bridge';
import type { BinaryId, BinaryStatus } from '@/core/types';
import { Alert, Button, CopyButton, Spinner } from '@/components/ui';

/**
 * Blocks a tool that needs an external program until it is available, and shows
 * exactly how to get it. Toolbox never installs anything on the user's behalf.
 */
export function DependencyGate({
  requires,
  children,
}: {
  requires: BinaryId[] | undefined;
  children: React.ReactNode;
}) {
  const [statuses, setStatuses] = useState<BinaryStatus[] | null>(null);
  const [commands, setCommands] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);

  const refresh = async () => {
    if (!requires?.length) {
      setStatuses([]);
      return;
    }
    setChecking(true);
    try {
      const results = await Promise.all(requires.map((id) => checkBinary(id)));
      setStatuses(results);
      const missing = results.filter((r) => !r.installed);
      const cmds: Record<string, string> = {};
      for (const m of missing) {
        try {
          const info = await installInstructions(m.id);
          cmds[m.id] = info.command;
        } catch {
          cmds[m.id] = m.installHint;
        }
      }
      setCommands(cmds);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requires?.join(',')]);

  if (!requires?.length) return <>{children}</>;
  if (statuses === null) {
    return (
      <div className="flex items-center gap-2 py-8 text-[12.5px] text-ink-faint">
        <Spinner /> Checking dependencies…
      </div>
    );
  }

  const missing = statuses.filter((s) => !s.installed);
  if (missing.length === 0) return <>{children}</>;

  return (
    <div className="space-y-3">
      {missing.map((m) => (
        <Alert key={m.id} tone="warn" title={`${m.label} is required for this tool.`}>
          <p>{m.usedFor}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="selectable rounded-md border border-warn/25 bg-panel px-2 py-1 font-mono text-[11.5px] text-ink">
              {commands[m.id] ?? m.installHint}
            </code>
            <CopyButton value={commands[m.id] ?? m.installHint} label="Copy command" size="sm" />
            <Button size="sm" variant="ghost" icon="RefreshCw" loading={checking} onClick={() => void refresh()}>
              Check again
            </Button>
          </div>
          <p className="mt-2 text-[11.5px] opacity-80">
            Already installed somewhere else? Set the exact path in Settings › Advanced.
          </p>
        </Alert>
      ))}
    </div>
  );
}
