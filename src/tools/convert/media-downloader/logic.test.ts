import { describe, it, expect } from 'vitest';
import {
  QUALITY_PRESETS,
  buildDownloadOpts,
  codecLabel,
  describeFormat,
  formatKind,
  formatWireProblem,
  formatWireReason,
  heightOf,
  isCustomFormat,
  isSelectableFormat,
  isUsableUrl,
  needsFfmpeg,
  qualityNeedsFfmpeg,
  sortFormats,
  tidyProgressLine,
  type MediaFormat,
} from './logic';

function fmt(patch: Partial<MediaFormat>): MediaFormat {
  return {
    id: '1',
    ext: 'mp4',
    resolution: '1920x1080',
    note: '',
    filesize: null,
    vcodec: 'avc1.640028',
    acodec: 'mp4a.40.2',
    fps: 30,
    ...patch,
  };
}

describe('urlProblem / isUsableUrl', () => {
  it('accepts an ordinary link', () => {
    expect(isUsableUrl('https://example.com/watch?v=abc')).toBe(true);
  });

  it('rejects the shapes the backend also refuses', () => {
    expect(isUsableUrl('file:///etc/passwd')).toBe(false);
    expect(isUsableUrl('javascript:alert(1)')).toBe(false);
    expect(isUsableUrl('example.com/video')).toBe(false);
    expect(isUsableUrl('https://example.com/a b')).toBe(false);
  });

  it('treats an empty field as "nothing to say yet", not an error', () => {
    expect(isUsableUrl('   ')).toBe(false);
  });

  it('rejects a host with no dot in it', () => {
    expect(isUsableUrl('https://localhost/video')).toBe(false);
    expect(isUsableUrl('https://a.co/v')).toBe(true);
  });
});

describe('formatKind and codecLabel', () => {
  it('separates muxed, video-only and audio-only formats', () => {
    expect(formatKind(fmt({}))).toBe('video+audio');
    expect(formatKind(fmt({ acodec: 'none' }))).toBe('video');
    expect(formatKind(fmt({ vcodec: 'none', resolution: 'audio only' }))).toBe('audio');
    expect(formatKind(fmt({ vcodec: 'none', acodec: 'none' }))).toBe('unknown');
  });

  it('shortens codec strings and drops the "none" placeholders', () => {
    expect(codecLabel(fmt({}))).toBe('avc1 + mp4a');
    expect(codecLabel(fmt({ vcodec: 'none' }))).toBe('mp4a');
    expect(codecLabel(fmt({ vcodec: 'none', acodec: 'none' }))).toBe('—');
    expect(codecLabel(fmt({ vcodec: '', acodec: 'opus' }))).toBe('opus');
  });
});

describe('heightOf', () => {
  it('reads the vertical resolution from either notation', () => {
    expect(heightOf(fmt({ resolution: '1920x1080' }))).toBe(1080);
    expect(heightOf(fmt({ resolution: '640×360' }))).toBe(360);
    expect(heightOf(fmt({ resolution: '720p' }))).toBe(720);
  });

  it('returns zero when there is no picture', () => {
    expect(heightOf(fmt({ resolution: 'audio only' }))).toBe(0);
    expect(heightOf(fmt({ resolution: '' }))).toBe(0);
  });
});

describe('sortFormats', () => {
  it('puts the best video first and audio-only last', () => {
    const list = [
      fmt({ id: 'audio', vcodec: 'none', resolution: 'audio only', filesize: 900 }),
      fmt({ id: 'small', resolution: '640x360' }),
      fmt({ id: 'big', resolution: '3840x2160' }),
      fmt({ id: 'medium', resolution: '1280x720' }),
    ];
    expect(sortFormats(list).map((f) => f.id)).toEqual(['big', 'medium', 'small', 'audio']);
  });

  it('breaks a resolution tie on frame rate, then on size', () => {
    const list = [
      fmt({ id: 'a', fps: 30, filesize: 100 }),
      fmt({ id: 'b', fps: 60, filesize: 100 }),
      fmt({ id: 'c', fps: 30, filesize: 500 }),
    ];
    expect(sortFormats(list).map((f) => f.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the list it was given', () => {
    const list = [fmt({ id: 'low', resolution: '640x360' }), fmt({ id: 'high', resolution: '1920x1080' })];
    sortFormats(list);
    expect(list.map((f) => f.id)).toEqual(['low', 'high']);
  });
});

describe('describeFormat', () => {
  it('says "audio only" instead of repeating an empty resolution', () => {
    expect(describeFormat(fmt({ ext: 'm4a', vcodec: 'none', resolution: 'audio only', note: 'medium' }))).toBe(
      'M4A · audio only · medium',
    );
  });

  it('leaves out a missing note', () => {
    expect(describeFormat(fmt({ resolution: '1280x720' }))).toBe('MP4 · 1280x720');
  });
});

describe('buildDownloadOpts', () => {
  it('forwards a preset and the switches exactly as DownloadOpts expects them', () => {
    expect(
      buildDownloadOpts({ quality: 'audio-mp3', playlist: true, embedThumbnail: true, writeSubtitles: false }),
    ).toEqual({ quality: 'audio-mp3', playlist: true, embedThumbnail: true, writeSubtitles: false });
  });

  it('passes a raw format id straight through', () => {
    expect(
      buildDownloadOpts({ quality: '137+140', playlist: false, embedThumbnail: false, writeSubtitles: false }).quality,
    ).toBe('137+140');
  });
});

describe('isCustomFormat', () => {
  it('recognises every preset as not custom', () => {
    for (const preset of QUALITY_PRESETS) {
      expect(isCustomFormat(preset.value)).toBe(false);
    }
  });

  it('treats a format id as custom', () => {
    expect(isCustomFormat('248')).toBe(true);
  });
});

describe('formatWireProblem', () => {
  it('refuses a digits-only id, which download_media would read as a height cap', () => {
    // 18, 22, 137, 140, 248 and 251 are all ordinary YouTube ids.
    for (const id of ['18', '22', '137', '140', '248', '251']) {
      expect(formatWireProblem(id), id).toBe('numeric');
    }
    expect(formatWireReason('248')).toMatch(/pixels tall/);
  });

  it('refuses an id the backend would reject on its character check', () => {
    expect(formatWireProblem('dash-video=1234')).toBe('characters');
    expect(formatWireProblem('')).toBe('characters');
    expect(formatWireProblem('   ')).toBe('characters');
    expect(formatWireReason('hls/720')).toMatch(/characters/);
  });

  it('accepts an id that survives the trip unchanged', () => {
    expect(formatWireProblem('hls-1080')).toBeNull();
    expect(formatWireProblem('137+140')).toBeNull();
    expect(formatWireProblem('http-720p')).toBeNull();
    expect(formatWireReason('hls-1080')).toBeNull();
  });

  it('drives which rows the table offers', () => {
    expect(isSelectableFormat(fmt({ id: 'hls-1080' }))).toBe(true);
    expect(isSelectableFormat(fmt({ id: '248' }))).toBe(false);
  });
});

describe('qualityNeedsFfmpeg', () => {
  it('flags every preset that yt-dlp cannot produce on its own', () => {
    expect(QUALITY_PRESETS.filter((p) => qualityNeedsFfmpeg(p.value)).map((p) => p.value)).toEqual([
      'best',
      '1080',
      '720',
      '480',
      'audio-mp3',
    ]);
    expect(qualityNeedsFfmpeg('audio-original')).toBe(false);
  });

  it('needs FFmpeg for a merged format id but not for a single stream', () => {
    expect(qualityNeedsFfmpeg('137+140')).toBe(true);
    expect(qualityNeedsFfmpeg('hls-1080')).toBe(false);
  });

  it('counts the thumbnail post-processor, which is also FFmpeg', () => {
    expect(needsFfmpeg({ quality: 'audio-original', embedThumbnail: false })).toBe(false);
    expect(needsFfmpeg({ quality: 'audio-original', embedThumbnail: true })).toBe(true);
    expect(needsFfmpeg({ quality: 'best', embedThumbnail: false })).toBe(true);
  });
});

describe('tidyProgressLine', () => {
  it('drops the yt-dlp prefix and collapses whitespace', () => {
    expect(tidyProgressLine('[download]  42.3% of 12.34MiB at  3.20MiB/s')).toBe('42.3% of 12.34MiB at 3.20MiB/s');
  });

  it('returns null for nothing useful', () => {
    expect(tidyProgressLine(null)).toBeNull();
    expect(tidyProgressLine('   ')).toBeNull();
  });
});
