import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/normalize',
  name: 'Normalize Volume',
  description: 'Even out loudness to the streaming standard',
  category: 'audio',
  icon: 'Activity',
  weight: 68,
  requires: ['ffmpeg'],
  keywords: [
    'normalize audio',
    'loudness',
    'lufs',
    'ebu r128',
    'loudnorm',
    'even out volume',
    'quiet recording',
    'podcast loudness',
    'match volume between tracks',
    'normalizar audio',
    'nivelar volumen',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
    ],
  },
  produces: ['mp3', 'm4a', 'wav', 'flac'],
  quickLabel: 'Normalize the volume',
  load: () => import('./ui'),
});
