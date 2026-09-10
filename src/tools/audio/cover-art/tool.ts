import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/cover-art',
  name: 'Extract Cover Art',
  description: 'Save the artwork embedded in a song as an image',
  category: 'audio',
  icon: 'Disc3',
  weight: 35,
  requires: ['ffmpeg'],
  keywords: [
    'album art',
    'cover art',
    'extract artwork',
    'get album cover',
    'mp3 artwork',
    'save album image',
    'thumbnail from mp3',
    'id3 picture',
    'caratula',
    'portada album',
    'extraer imagen',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
    ],
    multiple: false,
  },
  produces: ['jpg'],
  quickLabel: 'Extract the cover art',
  load: () => import('./ui'),
});
