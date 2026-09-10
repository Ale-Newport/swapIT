import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/resize',
  name: 'Resize Video',
  description: 'Scale video to 720p, 1080p, 4K or a custom size',
  category: 'video',
  icon: 'Scaling',
  weight: 80,
  requires: ['ffmpeg'],
  keywords: [
    'resize video', 'scale video', 'change resolution', '1080p', '720p', '4k',
    'downscale', 'shrink resolution', 'vertical video', 'redimensionar video',
    'escalar video', 'cambiar resolucion',
  ],
  accepts: {
    kinds: ['video'],
    extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'mts', 'm2ts'],
  },
  produces: ['mp4', 'mov', 'mkv', 'webm'],
  quickLabel: 'Resize this video',
  load: () => import('./ui'),
});
