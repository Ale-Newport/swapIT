import { useEffect, useState } from 'react';
import { useSettings } from '@/core/settings';

export const DEFAULT_ACCENT = '#0a84ff';
export const DEFAULT_OPACITY = 0.7;

export const ACCENT_CHOICES = [
  { id: 'blue', label: 'Blue', value: '#0a84ff' },
  { id: 'purple', label: 'Purple', value: '#bf5af2' },
  { id: 'pink', label: 'Pink', value: '#ff375f' },
  { id: 'orange', label: 'Orange', value: '#ff9f0a' },
  { id: 'green', label: 'Green', value: '#30d158' },
  { id: 'graphite', label: 'Graphite', value: '#8e8e93' },
];

export type ThemePref = 'auto' | 'light' | 'dark';

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Resolve the glass theme and the accent/opacity the user picked. */
export function useAppearance(): { theme: 'light' | 'dark'; pref: ThemePref; accent: string; opacity: number } {
  const settings = useSettings((s) => s.settings);
  const [dark, setDark] = useState(systemDark);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const pref: ThemePref = settings.radialTheme === 'light' || settings.radialTheme === 'dark' ? settings.radialTheme : 'auto';
  const theme = pref === 'auto' ? (dark ? 'dark' : 'light') : pref;
  const accent = typeof settings.radialAccent === 'string' && /^#[0-9a-f]{6}$/i.test(settings.radialAccent) ? settings.radialAccent : DEFAULT_ACCENT;
  const rawOpacity = typeof settings.radialOpacity === 'number' ? settings.radialOpacity : DEFAULT_OPACITY;
  const opacity = Math.min(1, Math.max(0.2, rawOpacity));
  return { theme, pref, accent, opacity };
}
