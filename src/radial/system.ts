import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { call } from '@/core/bridge';

/** Copy text to the system clipboard, falling back to the web API outside Tauri. */
export async function copyText(text: string): Promise<void> {
  try {
    await writeText(text);
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

export async function pasteText(): Promise<string> {
  try {
    return (await readText()) ?? '';
  } catch {
    return navigator.clipboard.readText().catch(() => '');
  }
}

/** A macOS notification, if the user has allowed them. Never throws. */
export async function notify(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) sendNotification({ title, body });
  } catch {
    /* notifications are a nicety */
  }
}

/** Languages worth asking Tesseract for: English plus the system language when installed. */
let languageCache: string | null = null;
export async function ocrLanguages(): Promise<string> {
  if (languageCache) return languageCache;
  const wanted = new Set(['eng']);
  const system = (navigator.language || 'en').slice(0, 2).toLowerCase();
  const map: Record<string, string> = { es: 'spa', fr: 'fra', de: 'deu', it: 'ita', pt: 'por', nl: 'nld', ca: 'cat' };
  if (map[system]) wanted.add(map[system]);
  try {
    const available = await call<string[]>('available_ocr_languages');
    const have = new Set(available);
    const picked = [...wanted].filter((l) => have.has(l));
    languageCache = (picked.length > 0 ? picked : ['eng']).join('+');
  } catch {
    languageCache = 'eng';
  }
  return languageCache;
}

/** Local time as `2026-11-04 at 14.03.22`, the way macOS names its own recordings. */
export function stamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} at ${p(date.getHours())}.${p(date.getMinutes())}.${p(date.getSeconds())}`;
}

export function isoDate(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function folderName(path: string | null): string {
  if (!path) return 'Desktop';
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '/';
}
