import { describe, expect, it } from 'vitest';
import {
  buildOps,
  container,
  effectiveAudioCodec,
  effectiveVideoCodec,
  qualityLabel,
  supportsAudioBitrate,
  supportsCrf,
  supportsPreset,
  supportsVideoBitrate,
  type ConvertSettings,
} from './logic';

const base: ConvertSettings = {
  format: 'mp4',
  videoCodec: 'auto',
  audioCodec: 'auto',
  qualityMode: 'crf',
  crf: 23,
  videoBitrateKbps: 4000,
  audioBitrate: '192k',
  preset: 'medium',
  removeAudio: false,
};

describe('codec resolution', () => {
  it('mirrors the backend default for each container', () => {
    expect(effectiveVideoCodec('webm', 'auto')).toBe('libvpx-vp9');
    expect(effectiveVideoCodec('avi', 'auto')).toBe('mpeg4');
    expect(effectiveVideoCodec('mkv', 'auto')).toBe('libx264');
    expect(effectiveAudioCodec('webm', 'auto')).toBe('libopus');
    expect(effectiveAudioCodec('mov', 'auto')).toBe('aac');
  });

  it('knows which encoders read CRF and -preset', () => {
    expect(supportsCrf('mp4', 'auto')).toBe(true);
    expect(supportsCrf('webm', 'auto')).toBe(true);
    expect(supportsCrf('mov', 'prores_ks')).toBe(false);
    expect(supportsCrf('avi', 'auto')).toBe(false);
    expect(supportsPreset('mkv', 'libx265')).toBe(true);
    expect(supportsPreset('webm', 'auto')).toBe(false);
  });

  it('hides the bitrate control for lossless and copied audio', () => {
    expect(supportsAudioBitrate('mov', 'pcm_s16le')).toBe(false);
    expect(supportsAudioBitrate('mkv', 'flac')).toBe(false);
    expect(supportsAudioBitrate('mp4', 'copy')).toBe(false);
    expect(supportsAudioBitrate('mp4', 'aac')).toBe(true);
  });

  it('only offers codecs the container can mux', () => {
    expect(container('webm').video).not.toContain('libx264');
    expect(container('mp4').video).not.toContain('prores_ks');
    expect(container('nonsense').value).toBe('mp4');
  });
});

describe('buildOps', () => {
  it('remuxes without encoders when the codec is copy', () => {
    const ops = buildOps({ ...base, videoCodec: 'copy', crf: 18 });
    expect(ops).toEqual({ format: 'mp4', copyStreams: true, removeAudio: false });
    expect(ops.crf).toBeUndefined();
    expect(ops.videoCodec).toBeUndefined();
  });

  it('leaves the codec unset on auto so the backend picks the container default', () => {
    const ops = buildOps(base);
    expect(ops.videoCodec).toBeUndefined();
    expect(ops.audioCodec).toBeUndefined();
    expect(ops.crf).toBe(23);
    expect(ops.preset).toBe('medium');
    expect(ops.audioBitrate).toBe('192k');
  });

  it('never sends a CRF to an encoder that ignores it', () => {
    const prores = buildOps({ ...base, format: 'mov', videoCodec: 'prores_ks' });
    expect(prores.crf).toBeUndefined();
    expect(prores.preset).toBeUndefined();
    expect(prores.videoCodec).toBe('prores_ks');
  });

  it('formats the bitrate the way FFmpeg expects', () => {
    const ops = buildOps({ ...base, qualityMode: 'bitrate', videoBitrateKbps: 2500.4 });
    expect(ops.videoBitrate).toBe('2500k');
    expect(ops.crf).toBeUndefined();
  });

  it('drops a zero bitrate rather than sending -b:v 0k', () => {
    const ops = buildOps({ ...base, qualityMode: 'bitrate', videoBitrateKbps: 0 });
    expect(ops.videoBitrate).toBeUndefined();
  });

  it('omits every audio option when the track is removed', () => {
    const ops = buildOps({ ...base, removeAudio: true, audioCodec: 'aac' });
    expect(ops.removeAudio).toBe(true);
    expect(ops.audioCodec).toBeUndefined();
    expect(ops.audioBitrate).toBeUndefined();
  });

  it('skips the bitrate for lossless audio', () => {
    const ops = buildOps({ ...base, format: 'mov', audioCodec: 'pcm_s16le' });
    expect(ops.audioCodec).toBe('pcm_s16le');
    expect(ops.audioBitrate).toBeUndefined();
  });
});

describe('qualityLabel', () => {
  it('covers the whole slider range', () => {
    expect(qualityLabel(14)).toBe('Visually lossless');
    expect(qualityLabel(23)).toBe('Great — recommended');
    expect(qualityLabel(28)).toBe('Good');
    expect(qualityLabel(40)).toBe('Smallest — visible artefacts');
  });
});

describe('supportsVideoBitrate', () => {
  it('refuses to send a meaningless -b:v to ProRes', () => {
    expect(supportsVideoBitrate('mov', 'prores_ks')).toBe(false);
    expect(supportsVideoBitrate('avi', 'mpeg4')).toBe(true);
    expect(supportsVideoBitrate('mp4', 'auto')).toBe(true);
  });

  it('keeps the bitrate out of the ProRes payload', () => {
    const ops = buildOps({ ...base, format: 'mov', videoCodec: 'prores_ks', qualityMode: 'bitrate', videoBitrateKbps: 4000 });
    expect(ops.videoBitrate).toBeUndefined();
    expect(ops.crf).toBeUndefined();
  });

  it('still sends one to MPEG-4, which needs it', () => {
    const ops = buildOps({ ...base, format: 'avi', videoCodec: 'mpeg4', qualityMode: 'bitrate', videoBitrateKbps: 4000 });
    expect(ops.videoBitrate).toBe('4000k');
  });
});
