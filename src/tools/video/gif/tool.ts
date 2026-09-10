import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/gif',
  name: 'Video to GIF',
  description: 'Turn a clip into a sharp animated GIF',
  category: 'video',
  icon: 'Film',
  weight: 88,
  requires: ['ffmpeg'],
  keywords: [
    'video to gif', 'mp4 to gif', 'mov to gif', 'animated gif', 'make a gif', 'gif maker',
    'screen recording to gif', 'reaction gif', 'convertir video a gif', 'crear gif',
  ],
  accepts: { kinds: ['video'], multiple: false },
  produces: ['gif'],
  quickLabel: 'Make a GIF',
  load: () => import('./ui'),
});
