import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/dimensions',
  name: 'Image Dimensions',
  description: 'Read width, height, megapixels and colour depth in bulk',
  category: 'images',
  icon: 'Ruler',
  weight: 30,
  keywords: [
    'dimensions', 'image size', 'width height', 'resolution', 'megapixels', 'aspect ratio',
    'how big is this image', 'pixel size', 'tamaño de imagen', 'dimensiones', 'proporción',
    'bulk image info',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif', 'tif', 'tiff', 'ico', 'tga', 'qoi'],
  },
  quickLabel: 'Check its dimensions',
  load: () => import('./ui'),
});
