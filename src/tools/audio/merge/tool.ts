import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/merge',
  name: 'Merge Audio',
  description: 'Join audio files into one track, in the order you choose',
  category: 'audio',
  icon: 'Combine',
  weight: 70,
  requires: ['ffmpeg'],
  keywords: [
    'merge audio',
    'join mp3',
    'combine audio files',
    'concatenate audio',
    'stitch tracks',
    'one long file',
    'audiobook chapters',
    'podcast segments',
    'unir audio',
    'juntar mp3',
    'combinar audio',
  ],
  accepts: {
    kinds: ['audio'],
    extensions: [
      'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
      'aiff', 'aif', 'wma', 'caf', 'ac3', 'mka', 'au',
    ],
  },
  produces: ['mp3', 'm4a', 'wav', 'flac'],
  quickLabel: 'Merge these files',
  load: () => import('./ui'),
});
