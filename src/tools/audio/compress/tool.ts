import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/compress',
  name: 'Compress Audio',
  description: 'Shrink audio files by re-encoding at a lower bitrate',
  category: 'audio',
  icon: 'Minimize2',
  weight: 85,
  requires: ['ffmpeg'],
  keywords: [
    'compress audio',
    'reduce audio size',
    'make mp3 smaller',
    'shrink audio file',
    'lower bitrate',
    'audio too big for email',
    'podcast size',
    'voice memo',
    'comprimir audio',
    'reducir tamaño audio',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
    ],
  },
  produces: ['mp3', 'm4a'],
  quickLabel: 'Make this smaller',
  load: () => import('./ui'),
});
