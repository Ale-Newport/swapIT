import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/volume',
  name: 'Change Volume',
  description: 'Make audio louder or quieter by an exact amount',
  category: 'audio',
  icon: 'Volume2',
  weight: 60,
  requires: ['ffmpeg'],
  keywords: [
    'change volume',
    'louder',
    'quieter',
    'boost audio',
    'increase volume mp3',
    'turn down audio',
    'gain',
    'decibels',
    'db',
    'amplify',
    'subir volumen',
    'bajar volumen',
    'aumentar audio',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
    ],
  },
  produces: ['mp3', 'm4a', 'wav', 'flac'],
  quickLabel: 'Change the volume',
  load: () => import('./ui'),
});
