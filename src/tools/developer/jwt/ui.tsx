import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Icon,
  IconButton,
  Section,
  Stat,
  Textarea,
} from '@/components/ui';
import {
  decodeJwt,
  describeAlgorithm,
  readRegisteredClaims,
  readTiming,
  type DecodedJwt,
  type TimeState,
} from './logic';

/**
 * An example token whose claims expired back in 2018, so the sample shows the
 * expiry badge doing its job. The signature segment is decoration — nothing here
 * verifies it.
 */
const SAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyNDI2MjIsImlzcyI6Imh0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSIsImF1ZCI6WyJhcGkiLCJ3ZWIiXX0.' +
  'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

const STATE_TONE: Record<TimeState, 'success' | 'danger' | 'warn' | 'neutral'> = {
  valid: 'success',
  expired: 'danger',
  'not-yet': 'warn',
  none: 'neutral',
};

const STATE_ICON: Record<TimeState, string> = {
  valid: 'CircleCheck',
  expired: 'CircleAlert',
  'not-yet': 'Clock',
  none: 'Info',
};

function absolute(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

function JsonPane({ title, icon, text }: { title: string; icon: string; text: string }) {
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Icon name={icon} size={14} className="text-ink-faint" />
          {title}
        </span>
      }
      actions={<CopyButton size="sm" variant="ghost" value={text} />}
      dense
    >
      <pre className="selectable max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-canvas p-3 font-mono text-[12.5px] leading-[1.55] text-ink">
        {text}
      </pre>
    </Section>
  );
}

export default function JwtDecoder() {
  const [token, setToken] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Relative times go stale while the window sits open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const decoded = useMemo(() => {
    if (!token.trim()) return null;
    try {
      return { value: decodeJwt(token), error: null as string | null };
    } catch (err) {
      return { value: null as DecodedJwt | null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [token]);

  const jwt = decoded?.value ?? null;
  const timing = useMemo(() => (jwt ? readTiming(jwt.payload, now) : null), [jwt, now]);
  const claims = useMemo(() => (jwt ? readRegisteredClaims(jwt.payload) : []), [jwt]);
  const algorithmNote = jwt ? describeAlgorithm(jwt.algorithm, jwt.unsigned) : null;

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Token"
            description="Decoded here on your Mac — the token is never uploaded, logged or written to disk"
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="ClipboardPaste"
                  onClick={async () => {
                    try {
                      setToken(await navigator.clipboard.readText());
                    } catch {
                      /* clipboard unavailable */
                    }
                  }}
                >
                  Paste
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setToken(SAMPLE)}>
                  Sample
                </Button>
                <IconButton icon="X" label="Clear the token" size="sm" onClick={() => setToken('')} />
              </>
            }
          >
            <Textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP…"
              className="w-full break-all"
            />
            <p className="mt-1.5 text-[11px] text-ink-faint">
              {token.trim() ? `${token.trim().length.toLocaleString()} characters` : 'A “Bearer ” prefix is fine — it is ignored.'}
            </p>
          </Section>

          {decoded?.error && (
            <Alert tone="danger" title="This is not a readable JWT">
              {decoded.error}
            </Alert>
          )}

          {jwt && timing && (
            <>
              <Section
                title={
                  <span className="flex items-center gap-2">
                    <Icon name={STATE_ICON[timing.state]} size={15} className={
                      timing.state === 'valid'
                        ? 'text-success'
                        : timing.state === 'expired'
                          ? 'text-danger'
                          : timing.state === 'not-yet'
                            ? 'text-warn'
                            : 'text-ink-faint'
                    } />
                    Status
                  </span>
                }
                actions={<Badge tone={STATE_TONE[timing.state]}>{timing.summary}</Badge>}
              >
                <div className="space-y-3">
                  {timing.claims.length > 0 && (
                    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                      {timing.claims.map((claim) => (
                        <li key={claim.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-panel px-3 py-2">
                          <span className="w-28 shrink-0 text-[12.5px] text-ink-faint">
                            {claim.label}
                            <span className="ml-1.5 font-mono text-[11px]">{claim.key}</span>
                          </span>
                          <span className="selectable text-[12.5px] text-ink">{absolute(claim.seconds)}</span>
                          <span className="text-[12px] text-ink-soft">· {claim.relative}</span>
                          {claim.wasMillis && <Badge tone="warn">sent in milliseconds</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {timing.claims.length === 0 && (
                    <p className="text-[12.5px] text-ink-faint">
                      This payload carries no exp, nbf or iat claim, so nothing here says when the token stops working.
                    </p>
                  )}

                  {algorithmNote && (
                    <Alert
                      tone={algorithmNote.tone === 'danger' ? 'danger' : algorithmNote.tone === 'warn' ? 'warn' : 'info'}
                      title={jwt.algorithm ? `Algorithm: ${jwt.algorithm}` : 'No algorithm in the header'}
                    >
                      {algorithmNote.text}
                    </Alert>
                  )}

                  <Alert tone="info" title="The signature is not checked">
                    Toolbox reads the two data segments only. Verifying the signature needs the issuer&apos;s secret or
                    public key, which this tool never asks for — so treat a decoded token as unverified input.
                  </Alert>
                </div>
              </Section>

              {claims.length > 0 && (
                <Section title="Claims" description="The registered claims found in this payload" dense>
                  <ul className="divide-y divide-line">
                    {claims.map((claim) => (
                      <li key={claim.key} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-3 py-1.5">
                        <span className="text-[12.5px] text-ink-faint">
                          {claim.label}
                          <span className="ml-1.5 font-mono text-[11px]">{claim.key}</span>
                        </span>
                        <span className="selectable break-words text-[12.5px] text-ink">{claim.value}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <JsonPane title="Header" icon="FileCode2" text={jwt.headerText} />
                <JsonPane title="Payload" icon="Braces" text={jwt.payloadText} />
              </div>

              <Section
                title="Signature"
                description="Shown exactly as it appears in the token"
                actions={jwt.signature ? <CopyButton size="sm" variant="ghost" value={jwt.signature} /> : undefined}
                dense
              >
                {jwt.signature ? (
                  <p className="selectable break-all rounded-lg bg-canvas p-3 font-mono text-[12px] text-ink-soft">
                    {jwt.signature}
                  </p>
                ) : (
                  <p className="text-[12.5px] text-danger">
                    There is no signature — the token ends with a dot and nothing after it.
                  </p>
                )}
              </Section>
            </>
          )}
        </>
      }
      aside={
        <>
          <Section title="Token facts">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Algorithm" value={jwt?.algorithm ?? '—'} />
              <Stat label="Type" value={jwt?.tokenType ?? '—'} />
              <Stat label="Key ID" value={jwt?.keyId ?? '—'} hint={jwt?.keyId ? 'kid' : undefined} />
              <Stat
                label="Signature"
                value={jwt ? (jwt.signature ? `${jwt.signature.length} chars` : 'none') : '—'}
              />
            </div>
          </Section>

          <Section
            title={
              <span className="flex items-center gap-2">
                <Icon name="ShieldOff" size={14} className="text-ink-faint" />
                What this tool does not do
              </span>
            }
          >
            <ul className="space-y-2 text-[12.5px] leading-[1.55] text-ink-soft">
              <li>
                <span className="font-medium text-ink">Nothing leaves this Mac.</span> The token is split and
                base64-decoded in this window. There is no network call, no logging and nothing written to disk.
              </li>
              <li>
                <span className="font-medium text-ink">No signature verification.</span> A decoded payload proves
                nothing about who issued the token — that check needs the signing key.
              </li>
              <li>
                <span className="font-medium text-ink">A JWT is not encrypted.</span> Anyone holding it can read these
                claims, so treat one like a password and clear the box when you are done.
              </li>
            </ul>
          </Section>
        </>
      }
    />
  );
}
