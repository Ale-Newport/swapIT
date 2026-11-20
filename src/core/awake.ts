import { call } from './bridge';

/**
 * Keep the Mac awake with `caffeinate` (`src-tauri/src/cmd/awake.rs`). One session at a time:
 * starting another replaces it. It is tied to Toolbox, so quitting the app lets the Mac sleep again.
 */
export interface AwakeStatus {
  active: boolean;
  /** Unix milliseconds. */
  startedAt: number | null;
  /** Unix milliseconds; null while nothing runs or when it lasts until stopped. */
  endsAt: number | null;
  /** On battery a closed lid still puts the Mac to sleep. */
  onBattery: boolean;
}

export const keepAwakeStart = (minutes: number | null) => call<AwakeStatus>('keep_awake_start', { minutes });
export const keepAwakeStop = () => call<AwakeStatus>('keep_awake_stop');
export const keepAwakeStatus = () => call<AwakeStatus>('keep_awake_status');
