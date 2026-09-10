import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/trim',
  name: 'Trim Audio',
  description: 'Cut a clip out of an audio file using a visual waveform',
  category: 'audio',
  icon: 'Scissors',
  weight: 82,
  requires: ['ffmpeg'],
  keywords: [
    'trim audio',
    'cut mp3',
    'crop audio',
    'clip audio',
    'ringtone',
    'remove silence at the start',
    'shorten audio',
    'split song',
    'waveform',
    'recortar audio',
    'cortar mp3',
  ],
  accepts: {
    kinds: ['audio'],
    multiple: false,
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'ac3', 'mka', 'au',
    ],
  },
  // No `produces`: the clip always keeps the source container, so advertising
  // output formats would surface this tool for conversions it cannot do.
  quickLabel: 'Trim this audio',
  load: () => import('./ui'),
});
