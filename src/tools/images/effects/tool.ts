import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/effects',
  name: 'Image Effects',
  description: 'Add padding, rounded corners, borders and drop shadows',
  category: 'images',
  icon: 'Frame',
  weight: 65,
  keywords: [
    'padding', 'rounded corners', 'border', 'frame', 'drop shadow', 'screenshot polish',
    'margin', 'grayscale', 'black and white', 'background colour', 'mockup',
    'bordes redondeados', 'sombra', 'marco imagen',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp'],
  },
  produces: ['png', 'jpg', 'webp'],
  quickLabel: 'Add effects to this image',
  load: () => import('./ui'),
});
