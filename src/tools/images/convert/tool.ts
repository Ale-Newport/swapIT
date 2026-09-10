import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/convert',
  name: 'Image Converter',
  description: 'Convert between HEIC, JPG, PNG, WebP, AVIF, TIFF and more',
  category: 'images',
  icon: 'Images',
  weight: 100,
  keywords: [
    'heic to jpg', 'heic', 'jpeg', 'png', 'webp', 'avif', 'tiff', 'bmp', 'convert image',
    'change format', 'photo format', 'live photo', 'iphone photo', 'convertir imagen',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif', 'ico', 'tga', 'qoi'],
  },
  produces: ['jpg', 'png', 'webp', 'avif', 'tiff', 'bmp', 'gif', 'ico'],
  quickLabel: 'Convert image format',
  load: () => import('./ui'),
});
