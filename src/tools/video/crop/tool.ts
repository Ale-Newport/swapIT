import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/crop',
  name: 'Crop Video',
  description: 'Crop a video to a region or a social aspect ratio',
  category: 'video',
  icon: 'Crop',
  weight: 70,
  requires: ['ffmpeg'],
  keywords: [
    'crop video', 'remove black bars', 'aspect ratio', '16:9', '9:16', 'vertical video',
    'tiktok', 'instagram reel', 'cut edges', 'recortar video', 'encuadre', 'letterbox',
  ],
  accepts: {
    kinds: ['video'],
    extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'mts', 'm2ts'],
    multiple: false,
  },
  produces: ['mp4', 'mov', 'mkv', 'webm'],
  quickLabel: 'Crop this video',
  load: () => import('./ui'),
});
