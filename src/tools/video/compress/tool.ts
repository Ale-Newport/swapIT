import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/compress',
  name: 'Compress Video',
  description: 'Shrink video file size with the quality you choose',
  category: 'video',
  icon: 'Minimize2',
  weight: 96,
  requires: ['ffmpeg'],
  keywords: [
    'compress video', 'reduce video size', 'make video smaller', 'shrink video',
    'video too big', 'email video', 'whatsapp video', 'crf', 'bitrate',
    'comprimir video', 'reducir tamano video', 'optimize video',
  ],
  accepts: {
    kinds: ['video'],
    extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'mts', 'm2ts'],
  },
  produces: ['mp4', 'mkv', 'webm'],
  quickLabel: 'Compress this video',
  load: () => import('./ui'),
});
