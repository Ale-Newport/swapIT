import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/gif-frames',
  name: 'GIF to Frames',
  description: 'Split an animated GIF into numbered PNG or JPG frames',
  category: 'images',
  icon: 'Film',
  weight: 35,
  keywords: [
    'gif to png', 'gif frames', 'split gif', 'extract frames', 'animated gif',
    'explode gif', 'gif to jpg', 'sprite sheet source', 'gif a png', 'separar fotogramas',
  ],
  accepts: { extensions: ['gif'], multiple: false },
  produces: ['png', 'jpg'],
  quickLabel: 'Split into frames',
  load: () => import('./ui'),
});
