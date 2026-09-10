import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/frames',
  name: 'Extract Frames',
  description: 'Save stills from a video as PNG or JPG',
  category: 'video',
  icon: 'Images',
  weight: 72,
  requires: ['ffmpeg'],
  keywords: [
    'extract frames', 'video to images', 'video to png', 'video to jpg', 'screenshots from video',
    'stills', 'every frame', 'frame by frame', 'sprite sheet source', 'extraer fotogramas', 'video a imagenes',
  ],
  accepts: { kinds: ['video'], multiple: false },
  produces: ['png', 'jpg'],
  quickLabel: 'Extract frames',
  load: () => import('./ui'),
});
