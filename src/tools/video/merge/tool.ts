import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/merge',
  name: 'Merge Videos',
  description: 'Join clips end to end into one video',
  category: 'video',
  icon: 'Combine',
  weight: 68,
  requires: ['ffmpeg'],
  keywords: [
    'merge videos', 'join videos', 'concatenate', 'combine clips', 'stitch videos', 'append video',
    'one after another', 'unir videos', 'juntar videos', 'concatenar',
  ],
  accepts: { kinds: ['video'] },
  produces: ['mp4', 'mov', 'mkv', 'webm'],
  quickLabel: 'Merge these videos',
  load: () => import('./ui'),
});
