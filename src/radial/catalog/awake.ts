import { keepAwakeStart, keepAwakeStop, type AwakeStatus } from '@/core/awake';
import type { ActionResult, RadialItem } from '../model';
import { scheduleClose } from '../runner';
import { radial } from '../store';
import { menu, task } from './util';

/** The times the "Keep awake" ring offers, shortest first. */
export const AWAKE_CHOICES: Array<{ id: string; label: string; glyph?: string; icon?: string; minutes: number | null; phrase: string }> = [
  { id: 'awake:30m', label: '30 min', glyph: '30m', minutes: 30, phrase: '30 minutes' },
  { id: 'awake:1h', label: '1 hour', glyph: '1h', minutes: 60, phrase: '1 hour' },
  { id: 'awake:2h', label: '2 hours', glyph: '2h', minutes: 120, phrase: '2 hours' },
  { id: 'awake:4h', label: '4 hours', glyph: '4h', minutes: 240, phrase: '4 hours' },
  { id: 'awake:8h', label: '8 hours', glyph: '8h', minutes: 480, phrase: '8 hours' },
  { id: 'awake:forever', label: 'Until I stop', icon: 'Infinity', minutes: null, phrase: 'until you stop it' },
];

const KEYWORDS = [
  'caffeinate', 'caffeine', 'awake', 'stay awake', 'keep awake', 'sleep', 'no sleep', 'lid', 'closed lid', 'amphetamine',
  'cafeína', 'cafeina', 'despierto', 'no dormir', 'suspender', 'suspensión', 'mantener encendido', 'tapa',
];

/** "45 min", "1 h 20 min", "3 h". */
export function formatRemaining(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Say what is true now: how long it lasts, and whether closing the lid is covered. Short: it sits on one line of the pill. */
export function describeAwake(status: AwakeStatus): { title: string; detail: string } {
  const until = status.endsAt === null ? 'Until you stop it' : `Until ${clock(status.endsAt)}`;
  const lid = status.onBattery ? 'plug in to close the lid' : 'lid can be closed';
  return { title: 'Your Mac stays awake', detail: `${until} · ${lid}` };
}

async function stop(): Promise<ActionResult> {
  await keepAwakeStop();
  return { title: 'Your Mac can sleep again', detail: 'Keep awake is off.' };
}

function stopItem(awake: AwakeStatus | null): RadialItem {
  const left = awake?.active ? (awake.endsAt === null ? 'running until you stop it' : `${formatRemaining(awake.endsAt - Date.now())} left`) : '';
  return task({
    id: 'awake:stop',
    label: 'Stop',
    title: 'Let the Mac sleep again',
    hint: left || 'Not keeping the Mac awake',
    icon: 'Square',
    tone: 'danger',
    unavailable: awake?.active ? undefined : 'The Mac is not being kept awake',
    // Idle, Stop must not crowd the times out of a search for "sleep" or "awake".
    keywords: awake?.active ? [...KEYWORDS, 'stop', 'end', 'cancel', 'parar', 'terminar'] : ['stop keeping awake', 'parar'],
    run: stop,
  });
}

function choiceItem(choice: (typeof AWAKE_CHOICES)[number]): RadialItem {
  return task({
    id: choice.id,
    label: choice.label,
    glyph: choice.glyph,
    title: choice.minutes === null ? 'Keep the Mac awake until you stop it' : `Keep the Mac awake for ${choice.phrase}`,
    hint: 'Even with the lid closed, while plugged in',
    icon: choice.icon ?? 'Coffee',
    keywords: KEYWORDS,
    run: async (): Promise<ActionResult> => {
      const status = await keepAwakeStart(choice.minutes);
      const { title, detail } = describeAwake(status);
      return {
        title,
        detail,
        actions: [
          {
            id: 'awake-stop',
            label: 'Stop',
            icon: 'Square',
            run: async () => {
              await keepAwakeStop();
              radial.patch({ hud: { status: 'done', title: 'Your Mac can sleep again' } });
              scheduleClose(2400);
            },
          },
        ],
      };
    },
  });
}

/**
 * The "Keep awake ›" petal and every action behind it. While a session runs, the ring leads with
 * Stop and leaves out the shortest time, which keeps it at the six petals a ring can hold.
 */
export function awakeParts(awake: AwakeStatus | null): { menu: RadialItem | null; leaves: RadialItem[] } {
  const choices = AWAKE_CHOICES.map(choiceItem);
  const stopper = stopItem(awake);
  const children = awake?.active ? [stopper, ...choices.slice(1)] : choices;
  const hint = awake?.active
    ? awake.endsAt === null
      ? 'On until you stop it'
      : `On · ${formatRemaining(awake.endsAt - Date.now())} left`
    : 'Even with the lid closed';
  const petal = menu({
    id: 'menu:awake',
    label: 'Keep awake',
    title: awake?.active ? 'Keep awake is on' : 'Keep the Mac awake',
    hint,
    icon: 'Coffee',
    keywords: KEYWORDS,
    children,
  });
  return { menu: petal && awake?.active ? { ...petal, tone: 'accent' } : petal, leaves: [stopper, ...choices] };
}
