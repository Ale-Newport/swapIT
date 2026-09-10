import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/fps',
  name: 'Change Frame Rate',
  description: 'Set a video to 24, 25, 30, 50, 60 fps or your own',
  category: 'video',
  icon: 'Gauge',
  weight: 60,
  requires: ['ffmpeg'],
  keywords: [
    'fps', 'frame rate', '60fps', '30fps', '24fps', 'frames per second',
    'convert fps', 'pal ntsc', 'smooth video', 'cambiar fps', 'fotogramas por segundo',
    'interpolation',
  ],
  accepts: {
    kinds: ['video'],
    extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'mts', 'm2ts'],
  },
  produces: ['mp4', 'mov', 'mkv', 'webm'],
  quickLabel: 'Change the frame rate',
  load: () => import('./ui'),
});
