/** Container / codec knowledge for the video converter, kept pure and testable. */

export type VideoCodec = 'auto' | 'copy' | 'libx264' | 'libx265' | 'libvpx-vp9' | 'prores_ks' | 'mpeg4';
export type AudioCodec = 'auto' | 'copy' | 'aac' | 'libmp3lame' | 'libopus' | 'libvorbis' | 'flac' | 'pcm_s16le';

export interface Container {
  value: string;
  label: string;
  hint: string;
  video: VideoCodec[];
  audio: AudioCodec[];
}

/** Only combinations FFmpeg can actually mux are offered. */
export const CONTAINERS: Container[] = [
  {
    value: 'mp4',
    label: 'MP4 (.mp4)',
    hint: 'Plays everywhere — phones, browsers, TVs',
    video: ['auto', 'libx264', 'libx265', 'copy'],
    audio: ['auto', 'aac', 'libmp3lame', 'copy'],
  },
  {
    value: 'mov',
    label: 'QuickTime (.mov)',
    hint: 'Apple-native, the usual home for ProRes',
    video: ['auto', 'libx264', 'libx265', 'prores_ks', 'copy'],
    audio: ['auto', 'aac', 'pcm_s16le', 'copy'],
  },
  {
    value: 'm4v',
    label: 'iTunes video (.m4v)',
    hint: 'MP4 under a different name, for the Apple TV app',
    video: ['auto', 'libx264', 'libx265', 'copy'],
    audio: ['auto', 'aac', 'copy'],
  },
  {
    value: 'mkv',
    label: 'Matroska (.mkv)',
    hint: 'Takes almost any codec — great for archiving',
    video: ['auto', 'libx264', 'libx265', 'libvpx-vp9', 'prores_ks', 'copy'],
    audio: ['auto', 'aac', 'libopus', 'libmp3lame', 'flac', 'copy'],
  },
  {
    value: 'webm',
    label: 'WebM (.webm)',
    hint: 'Open format for the web, VP9 + Opus only',
    video: ['auto', 'libvpx-vp9', 'copy'],
    audio: ['auto', 'libopus', 'libvorbis', 'copy'],
  },
  {
    value: 'avi',
    label: 'AVI (.avi)',
    hint: 'Old Windows format, for legacy players',
    video: ['auto', 'mpeg4', 'libx264', 'copy'],
    audio: ['auto', 'libmp3lame', 'pcm_s16le', 'copy'],
  },
];

export const VIDEO_LABELS: Record<VideoCodec, string> = {
  auto: 'Match the format (recommended)',
  'libx264': 'H.264 — most compatible',
  'libx265': 'H.265 / HEVC — same look, smaller',
  'libvpx-vp9': 'VP9 — open, for the web',
  'prores_ks': 'ProRes 422 — for editing, very large',
  'mpeg4': 'MPEG-4 Part 2 — legacy',
  copy: 'Copy as-is — no re-encoding',
};

export const AUDIO_LABELS: Record<AudioCodec, string> = {
  auto: 'Match the format (recommended)',
  aac: 'AAC',
  'libmp3lame': 'MP3',
  'libopus': 'Opus',
  'libvorbis': 'Vorbis',
  flac: 'FLAC — lossless',
  'pcm_s16le': 'PCM — uncompressed',
  copy: 'Copy as-is',
};

export const PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];

export const AUDIO_BITRATES = ['320k', '256k', '192k', '160k', '128k', '96k', '64k'];

export function container(value: string): Container {
  return CONTAINERS.find((c) => c.value === value) ?? CONTAINERS[0];
}

/** What FFmpeg will really use — mirrors `codec_for` in media.rs. */
export function effectiveVideoCodec(format: string, codec: VideoCodec): string {
  if (codec !== 'auto') return codec;
  if (format === 'webm') return 'libvpx-vp9';
  if (format === 'avi') return 'mpeg4';
  return 'libx264';
}

export function effectiveAudioCodec(format: string, codec: AudioCodec): string {
  if (codec !== 'auto') return codec;
  if (format === 'webm') return 'libopus';
  if (format === 'avi') return 'libmp3lame';
  return 'aac';
}

/** The backend only forwards -crf to encoders that understand it. */
export function supportsCrf(format: string, codec: VideoCodec): boolean {
  const eff = effectiveVideoCodec(format, codec);
  return eff.startsWith('libx26') || eff.startsWith('libvpx') || eff.startsWith('libsvt');
}

/** -preset is an x264/x265 flag. */
export function supportsPreset(format: string, codec: VideoCodec): boolean {
  return effectiveVideoCodec(format, codec).startsWith('libx26');
}

/**
 * ProRes picks its own data rate from the profile, so a -b:v would be ignored.
 * Every other encoder here answers to one.
 */
export function supportsVideoBitrate(format: string, codec: VideoCodec): boolean {
  const eff = effectiveVideoCodec(format, codec);
  return eff !== 'prores_ks' && eff !== 'copy';
}

export function supportsAudioBitrate(format: string, codec: AudioCodec): boolean {
  const eff = effectiveAudioCodec(format, codec);
  return eff !== 'copy' && eff !== 'flac' && !eff.startsWith('pcm_');
}

/** Plain-language reading of a CRF value. */
export function qualityLabel(crf: number): string {
  if (crf <= 17) return 'Visually lossless';
  if (crf <= 20) return 'Excellent';
  if (crf <= 24) return 'Great — recommended';
  if (crf <= 28) return 'Good';
  if (crf <= 32) return 'Compact';
  return 'Smallest — visible artefacts';
}

export function qualityHint(crf: number): string {
  if (crf <= 17) return 'Files can end up larger than the original.';
  if (crf <= 20) return 'Hard to tell apart from the source on a big screen.';
  if (crf <= 24) return 'The sweet spot for almost every video.';
  if (crf <= 28) return 'Fine for sharing and messaging apps.';
  if (crf <= 32) return 'Noticeably softer on detailed footage.';
  return 'Blocking and smearing in fast motion.';
}

export interface ConvertSettings {
  format: string;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  qualityMode: 'crf' | 'bitrate';
  crf: number;
  videoBitrateKbps: number;
  audioBitrate: string;
  preset: string;
  removeAudio: boolean;
}

/** Build the `ops` payload for `process_video`. */
export function buildOps(s: ConvertSettings): Record<string, unknown> {
  // "Copy as-is" means remuxing: no filters, no encoders, just a new container.
  if (s.videoCodec === 'copy') {
    return { format: s.format, copyStreams: true, removeAudio: s.removeAudio };
  }

  const ops: Record<string, unknown> = {
    format: s.format,
    videoCodec: s.videoCodec === 'auto' ? undefined : s.videoCodec,
    removeAudio: s.removeAudio,
  };

  if (s.qualityMode === 'crf' && supportsCrf(s.format, s.videoCodec)) {
    ops.crf = s.crf;
  } else if (s.qualityMode === 'bitrate' && s.videoBitrateKbps > 0 && supportsVideoBitrate(s.format, s.videoCodec)) {
    ops.videoBitrate = `${Math.round(s.videoBitrateKbps)}k`;
  }

  if (supportsPreset(s.format, s.videoCodec)) ops.preset = s.preset;

  if (!s.removeAudio) {
    ops.audioCodec = s.audioCodec === 'auto' ? undefined : s.audioCodec;
    if (supportsAudioBitrate(s.format, s.audioCodec)) ops.audioBitrate = s.audioBitrate;
  }

  return ops;
}
