import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/thumbnail',
  name: 'Video Thumbnail',
  description: 'Pick a frame and save it as a poster image',
  category: 'video',
  icon: 'ImagePlus',
  weight: 66,
  requires: ['ffmpeg'],
  keywords: [
    'thumbnail', 'poster frame', 'cover image', 'video still', 'screenshot from video',
    'preview image', 'youtube thumbnail', 'miniatura de video', 'captura de video',
  ],
  accepts: { kinds: ['video'], multiple: false },
  produces: ['png'],
  quickLabel: 'Grab a thumbnail',
  load: () => import('./ui'),
});
