import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/metadata',
  name: 'Audio Metadata',
  description: 'Inspect codec, bitrate, sample rate, channels and tags',
  category: 'audio',
  icon: 'Info',
  weight: 40,
  requires: ['ffprobe'],
  keywords: [
    'audio info',
    'bitrate',
    'sample rate',
    'codec',
    'id3 tags',
    'song info',
    'mp3 details',
    'what bitrate is this',
    'inspect audio',
    'ffprobe',
    'informacion audio',
    'metadatos',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
    ],
  },
  quickLabel: 'Show audio details',
  load: () => import('./ui'),
});
