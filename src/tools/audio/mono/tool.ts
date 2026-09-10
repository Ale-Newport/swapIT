import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/mono',
  name: 'Stereo to Mono',
  description: 'Mix stereo audio down to a single channel',
  category: 'audio',
  icon: 'Podcast',
  weight: 45,
  requires: ['ffmpeg'],
  keywords: [
    'stereo to mono',
    'mono',
    'downmix',
    'one channel',
    'merge channels',
    'single channel',
    'podcast audio',
    'voice memo',
    'halve file size',
    'estereo a mono',
    'convertir a mono',
    'un canal',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
    ],
  },
  produces: ['mp3', 'm4a', 'wav', 'flac', 'ogg'],
  quickLabel: 'Mix down to mono',
  load: () => import('./ui'),
});
