import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/convert',
  name: 'Audio Converter',
  description: 'Convert between MP3, WAV, M4A, FLAC, OGG, Opus and AIFF',
  category: 'audio',
  icon: 'AudioLines',
  weight: 100,
  requires: ['ffmpeg'],
  keywords: [
    'm4a to mp3',
    'wav to mp3',
    'flac to mp3',
    'aac to mp3',
    'mp3 to wav',
    'convert audio',
    'audio format',
    'change audio format',
    'opus',
    'aiff',
    'ogg vorbis',
    'convertir audio',
    'cambiar formato de audio',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
    ],
  },
  produces: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'aiff'],
  quickLabel: 'Convert audio format',
  load: () => import('./ui'),
});
