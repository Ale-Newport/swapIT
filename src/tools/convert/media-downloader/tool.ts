import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'convert/media-downloader',
  name: 'Media Downloader',
  description: 'Save video or audio from a link you are licensed to keep',
  category: 'convert',
  icon: 'CloudDownload',
  weight: 60,
  standalone: true,
  // yt-dlp is the only hard requirement: without it nothing here works. FFmpeg is
  // needed by most quality presets and by Embed thumbnail, but not by "Audio ·
  // original" or a single stream from the format table, so ui.tsx probes for it and
  // blocks just those controls rather than the whole tool.
  requires: ['yt-dlp'],
  keywords: [
    'download video', 'download audio', 'yt-dlp', 'youtube-dl', 'save from link', 'video url',
    'mp3 from a link', 'subtitles', 'playlist', 'descargar video', 'descargar audio', 'guardar video',
  ],
  produces: ['mp4', 'mkv', 'webm', 'mp3', 'm4a'],
  load: () => import('./ui'),
});
