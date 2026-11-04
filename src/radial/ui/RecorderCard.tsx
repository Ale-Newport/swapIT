import { useCallback, useEffect, useRef, useState } from 'react';
import { appPaths } from '@/core/bridge';
import { saveBytes } from '@/core/save';
import { Icon } from '@/components/ui';
import { closeRadial, finishWith, loadBins } from '../runner';
import { openPrivacyPane } from '../native';
import { folderName, stamp } from '../system';

type Phase = 'idle' | 'recording' | 'paused' | 'saving';

const MIME_CANDIDATES: Array<{ mime: string; ext: string }> = [
  { mime: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a' },
  { mime: 'audio/mp4', ext: 'm4a' },
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm', ext: 'webm' },
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
];

function pickMime(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mime)) ?? null;
}

const BAR_COUNT = 44;

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const tenth = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${tenth}`;
}

/**
 * Record a voice memo straight into the folder you were looking at. The waveform
 * is drawn from the live microphone signal; the file is written as `.m4a` (or
 * converted to MP3/WAV when FFmpeg is installed).
 */
export function RecorderCard({ folder }: { folder: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<{ message: string; denied: boolean } | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [format, setFormat] = useState<'native' | 'mp3' | 'wav'>('native');
  const [canConvert, setCanConvert] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const levelsRef = useRef<number[]>(Array.from({ length: BAR_COUNT }, () => 0));
  const clockRef = useRef({ startedAt: 0, banked: 0 });
  const mimeRef = useRef(pickMime());
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  const stopStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    // Say so up front rather than after the user has pressed the red button.
    if (!navigator.mediaDevices?.getUserMedia || !mimeRef.current) {
      setError({ message: 'This build of the web view cannot record audio.', denied: false });
    }
    void loadBins().then((b) => setCanConvert(b.ffmpeg === true));
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      stopStream();
    };
  }, [stopStream]);

  // Draw: bars scroll left as new levels arrive, like a voice-memo waveform.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);

    if (analyser && phaseRef.current === 'recording') {
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, rms * 4.2);
      levelsRef.current.push(level);
      levelsRef.current.shift();
    }
    if (phaseRef.current === 'recording') {
      const now = performance.now();
      setElapsed(clockRef.current.banked + (now - clockRef.current.startedAt));
    }

    const accent = getComputedStyle(canvas).getPropertyValue('--rg-accent').trim() || '#0a84ff';
    const gap = 3;
    const barW = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    levelsRef.current.forEach((level, i) => {
      const bar = Math.max(3, level * (h - 6));
      const x = i * (barW + gap);
      const y = (h - bar) / 2;
      ctx2d.globalAlpha = 0.35 + (i / BAR_COUNT) * 0.65;
      ctx2d.fillStyle = phaseRef.current === 'recording' ? '#ff453a' : accent;
      ctx2d.beginPath();
      ctx2d.roundRect(x, y, barW, bar, barW / 2);
      ctx2d.fill();
    });
    ctx2d.globalAlpha = 1;
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  const listDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'audioinput'));
    } catch {
      /* the default device still works */
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || !mimeRef.current) {
      setError({ message: 'This build cannot record audio.', denied: false });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      void listDevices();

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      chunksRef.current = [];
      levelsRef.current = Array.from({ length: BAR_COUNT }, () => 0);
      const recorder = new MediaRecorder(stream, { mimeType: mimeRef.current.mime });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start(500);
      clockRef.current = { startedAt: performance.now(), banked: 0 };
      setElapsed(0);
      setPhase('recording');
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      const denied = name === 'NotAllowedError' || name === 'SecurityError';
      setError({
        denied,
        message: denied
          ? 'Toolbox is not allowed to use the microphone.'
          : name === 'NotFoundError'
            ? 'No microphone was found.'
            : 'The microphone could not be opened.',
      });
      stopStream();
    }
  }, [deviceId, listDevices, stopStream]);

  const pause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      clockRef.current.banked += performance.now() - clockRef.current.startedAt;
      setPhase('paused');
    } else if (recorder.state === 'paused') {
      recorder.resume();
      clockRef.current.startedAt = performance.now();
      setPhase('recording');
    }
  };

  const stopAndSave = useCallback(async () => {
    const recorder = recorderRef.current;
    const picked = mimeRef.current;
    if (!recorder || !picked) return;
    setPhase('saving');
    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: picked.mime.split(';')[0] }));
      recorder.stop();
    });
    stopStream();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const baseName = `Recording ${stamp()}`;
    const wantsConvert = format !== 'native' && canConvert;

    await finishWith('Saving recording', async () => {
      if (!wantsConvert) {
        const saved = await saveBytes(bytes, {
          source: null,
          output: { mode: 'custom', dir: folder, suffix: null, collision: 'rename', filename: baseName },
          ext: picked.ext,
        });
        return { title: saved.name, detail: `Saved in ${folderName(folder)}`, results: [saved] };
      }
      const temp = (await appPaths()).temp;
      const raw = await saveBytes(bytes, {
        source: null,
        output: { mode: 'custom', dir: temp, suffix: null, collision: 'rename', filename: baseName },
        ext: picked.ext,
      });
      const { call } = await import('@/core/bridge');
      const converted = await call<{ results: Array<import('@/core/types').FileResult> }>('process_video', {
        jobId: `rec_${Date.now().toString(36)}`,
        inputs: [raw.path],
        ops: { format, audioOnly: true },
        output: { mode: 'custom', dir: folder, suffix: null, collision: 'rename', filename: baseName },
      });
      return { title: converted.results[0]?.name ?? baseName, detail: `Saved in ${folderName(folder)}`, results: converted.results };
    });
  }, [canConvert, folder, format, stopStream]);

  const discard = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    stopStream();
    closeRadial();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (phase === 'recording' || phase === 'paused') setConfirmDiscard(true);
      else closeRadial();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if ((e.target as HTMLElement).tagName === 'SELECT') return;
      e.preventDefault();
      if (phase === 'idle') void start();
      else if (phase === 'recording' || phase === 'paused') void stopAndSave();
    }
  };

  useEffect(() => {
    if (!confirmDiscard) return;
    const t = setTimeout(() => setConfirmDiscard(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDiscard]);

  const live = phase === 'recording' || phase === 'paused';

  return (
    <div className="rg-panel rg-card" onKeyDown={onKeyDown} tabIndex={-1} ref={(el) => el?.focus({ preventScroll: true })}>
      <div className="rg-card-body">
        <div className="rg-card-head">
          <span className="rg-card-badge" data-live={phase === 'recording'}>
            <Icon name="Mic" size={17} />
          </span>
          <div className="rg-card-headtext">
            <div className="rg-card-title">{live ? (phase === 'paused' ? 'Paused' : 'Recording…') : 'Record audio'}</div>
            <div className="rg-card-sub">
              Saves in <b>{folderName(folder)}</b>
            </div>
          </div>
          <button
            type="button"
            className="rg-icon-btn"
            aria-label="Close"
            onClick={() => (live ? setConfirmDiscard(true) : closeRadial())}
          >
            <Icon name="X" size={13} />
          </button>
        </div>

        <div className="rg-rec-stage">
          <canvas ref={canvasRef} className="rg-wave" />
          <div className="rg-clock" data-live={phase === 'recording'}>
            {formatClock(elapsed)}
          </div>
        </div>

        {error && (
          <div className="rg-note" role="alert">
            <Icon name="TriangleAlert" size={14} />
            <span>{error.message}</span>
            {error.denied && (
              <button type="button" className="rg-btn" onClick={() => void openPrivacyPane('microphone')}>
                Open Settings
              </button>
            )}
          </div>
        )}

        <div className="rg-rec-controls">
          {phase === 'idle' && (
            <button
              type="button"
              className="rg-rec-main"
              onClick={() => void start()}
              aria-label="Start recording"
              disabled={Boolean(error) && !error?.denied}
            >
              <i />
            </button>
          )}
          {live && (
            <>
              <button type="button" className="rg-btn" onClick={pause}>
                <Icon name={phase === 'paused' ? 'Play' : 'Pause'} size={13} />
                {phase === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className="rg-rec-main" data-stop="true" onClick={() => void stopAndSave()} aria-label="Stop and save">
                <i />
              </button>
              <button
                type="button"
                className="rg-btn"
                data-danger="true"
                onClick={() => (confirmDiscard ? discard() : setConfirmDiscard(true))}
              >
                {confirmDiscard ? 'Discard?' : 'Discard'}
              </button>
            </>
          )}
          {phase === 'saving' && <span className="rg-card-sub">Saving…</span>}
        </div>

        <div className="rg-card-foot">
          <select
            className="rg-field rg-select"
            value={deviceId}
            disabled={live}
            onChange={(e) => setDeviceId(e.target.value)}
            aria-label="Microphone"
            onFocus={() => void listDevices()}
          >
            <option value="">Default microphone</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))}
          </select>
          <div className="rg-chips">
            <button type="button" className="rg-chip" data-on={format === 'native'} disabled={live} onClick={() => setFormat('native')}>
              {mimeRef.current?.ext.toUpperCase() ?? 'M4A'}
            </button>
            <button
              type="button"
              className="rg-chip"
              data-on={format === 'mp3'}
              disabled={live || !canConvert}
              title={canConvert ? 'Convert to MP3 when you stop' : 'Needs FFmpeg'}
              onClick={() => setFormat('mp3')}
            >
              MP3
            </button>
            <button
              type="button"
              className="rg-chip"
              data-on={format === 'wav'}
              disabled={live || !canConvert}
              title={canConvert ? 'Convert to WAV when you stop' : 'Needs FFmpeg'}
              onClick={() => setFormat('wav')}
            >
              WAV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
