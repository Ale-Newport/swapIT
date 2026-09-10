import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/compress',
  name: 'Compress Images',
  description: 'Shrink image files with quality and target size control',
  category: 'images',
  icon: 'Minimize2',
  weight: 92,
  keywords: [
    'compress', 'reduce image size', 'make photo smaller', 'optimize image', 'shrink jpg',
    'compress png', 'under 1mb', 'email attachment', 'web optimise', 'quality',
    'comprimir imagen', 'reducir peso foto',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp'],
  },
  produces: ['jpg', 'webp', 'png'],
  quickLabel: 'Compress this image',
  load: () => import('./ui'),
});
