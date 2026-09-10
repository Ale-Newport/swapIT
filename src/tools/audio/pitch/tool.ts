import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/pitch',
  name: 'Change Pitch',
  description: 'Shift audio up or down in semitones, keeping the same length',
  category: 'audio',
  icon: 'Music4',
  weight: 50,
  // FFprobe is not optional here: the shift is scaled by each file's own sample
  // rate, and without it every file that is not 44.1 kHz comes out audibly flat.
  requires: ['ffmpeg', 'ffprobe'],
  keywords: [
    'pitch shift',
    'transpose',
    'semitones',
    'key change',
    'higher voice',
    'lower voice',
    'chipmunk',
    'deep voice',
    'tune song',
    'cambiar tono',
    'transportar',
    'afinar',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
    ],
  },
  produces: ['mp3', 'm4a', 'wav', 'flac', 'ogg'],
  quickLabel: 'Shift the pitch',
  load: () => import('./ui'),
});
