import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/remove-metadata',
  name: 'Remove Audio Metadata',
  description: 'Strip every tag and embedded artwork without re-encoding',
  category: 'audio',
  icon: 'ShieldOff',
  weight: 42,
  requires: ['ffmpeg'],
  keywords: [
    'remove metadata',
    'strip id3 tags',
    'clear tags',
    'anonymize audio',
    'delete artist info',
    'privacy',
    'clean mp3',
    'remove album art',
    'quitar metadatos',
    'borrar etiquetas',
    'limpiar mp3',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
    ],
  },
  quickLabel: 'Strip the metadata',
  load: () => import('./ui'),
});
