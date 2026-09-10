import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/speed',
  name: 'Change Audio Speed',
  description: 'Speed up or slow down audio without changing the pitch',
  category: 'audio',
  icon: 'FastForward',
  weight: 58,
  requires: ['ffmpeg'],
  keywords: [
    'speed up audio',
    'slow down audio',
    'playback speed',
    'tempo',
    '2x audio',
    'faster podcast',
    'audiobook speed',
    'atempo',
    'time stretch',
    'acelerar audio',
    'ralentizar audio',
    'velocidad',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
    ],
  },
  produces: ['mp3', 'm4a', 'wav', 'flac', 'ogg'],
  quickLabel: 'Change the speed',
  load: () => import('./ui'),
});
