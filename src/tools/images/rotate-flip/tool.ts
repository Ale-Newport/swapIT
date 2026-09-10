import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/rotate-flip',
  name: 'Rotate & Flip',
  description: 'Turn images 90, 180 or 270 degrees and mirror them',
  category: 'images',
  icon: 'RotateCw',
  weight: 70,
  keywords: [
    'rotate', 'turn image', 'flip', 'mirror', 'sideways photo', 'upside down',
    'straighten', '90 degrees', 'landscape to portrait', 'girar imagen', 'rotar foto', 'voltear',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif'],
  },
  produces: ['jpg', 'png', 'webp'],
  quickLabel: 'Rotate or flip this image',
  load: () => import('./ui'),
});
