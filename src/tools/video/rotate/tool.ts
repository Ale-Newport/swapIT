import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/rotate',
  name: 'Rotate Video',
  description: 'Turn video by 90 degrees or mirror it, with a live preview',
  category: 'video',
  icon: 'RotateCw',
  weight: 55,
  requires: ['ffmpeg'],
  keywords: [
    'rotate', 'rotate video', 'turn video', '90 degrees', 'upside down', 'sideways video',
    'flip video', 'mirror video', 'portrait to landscape', 'girar video', 'rotar video', 'voltear video',
  ],
  accepts: { kinds: ['video'], extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] },
  produces: ['mp4', 'mov', 'mkv', 'webm'],
  quickLabel: 'Rotate this video',
  load: () => import('./ui'),
});
