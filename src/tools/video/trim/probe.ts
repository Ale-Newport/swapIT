import { useEffect, useState } from 'react';
import { call } from '@/core/bridge';

/** Mirrors `StreamInfo` in src-tauri/src/cmd/media.rs. */
export interface MediaStream {
  index: number;
  kind: string;
  codec: string;
  codecLong: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  bitrate?: number | null;
  sampleRate?: number | null;
  channels?: number | null;
  channelLayout?: string | null;
  pixFmt?: string | null;
  language?: string | null;
}

/** Mirrors `MediaInfo` in src-tauri/src/cmd/media.rs. */
export interface MediaInfo {
  path: string;
  name: string;
  size: number;
  duration?: number | null;
  formatName: string;
  formatLong: string;
  bitrate?: number | null;
  streams: MediaStream[];
  tags: Array<[string, string]>;
  video?: MediaStream | null;
  audio?: MediaStream | null;
}

export function probeMedia(paths: string[]): Promise<MediaInfo[]> {
  return call<MediaInfo[]>('probe_media', { inputs: paths });
}

/** Probe a single file with ffprobe, following the current selection. */
export function useProbe(path: string | null | undefined) {
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setInfo(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    probeMedia([path])
      .then((list) => {
        if (cancelled) return;
        setInfo(list[0] ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setInfo(null);
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'This file could not be read.';
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { info, loading, error };
}

/** "1920 × 1080" for a probed video stream. */
export function dimensions(info: MediaInfo | null): string | null {
  const v = info?.video;
  if (!v?.width || !v?.height) return null;
  return `${v.width} × ${v.height}`;
}

export function fpsLabel(fps: number | null | undefined): string {
  if (!fps || !Number.isFinite(fps)) return '—';
  const rounded = Math.round(fps * 100) / 100;
  return `${rounded} fps`;
}

/**
 * A frame from the video, rendered by FFmpeg into the temp folder. Calls are
 * debounced so dragging a scrubber does not spawn an encoder per pixel.
 */
export function usePreviewFrame(path: string | null, timestamp: number, width = 720, delay = 250) {
  const [framePath, setFramePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setFramePath(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      call<string>('preview_frame', { input: path, timestamp: Math.max(0, timestamp), width })
        .then((result) => {
          if (cancelled) return;
          setFramePath(result);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'This frame could not be rendered.',
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path, timestamp, width, delay]);

  return { framePath, loading, error };
}
