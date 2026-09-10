import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/tags',
  name: 'Edit Audio Tags',
  description: 'Set title, artist, album, year, genre and cover art',
  category: 'audio',
  icon: 'Tags',
  weight: 65,
  requires: ['ffmpeg'],
  keywords: [
    'id3 tags',
    'edit mp3 tags',
    'song title',
    'artist',
    'album',
    'album art',
    'cover art',
    'tag music',
    'metadata editor',
    'track number',
    'etiquetas mp3',
    'editar metadatos',
    'caratula',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
    ],
  },
  quickLabel: 'Edit the tags',
  load: () => import('./ui'),
});
