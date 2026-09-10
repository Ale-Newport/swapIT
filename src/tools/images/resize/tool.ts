import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/resize',
  name: 'Resize Image',
  description: 'Scale images to exact sizes or social media presets',
  category: 'images',
  icon: 'Scaling',
  weight: 95,
  keywords: [
    'resize', 'scale', 'dimensions', 'make image smaller', 'reduce image size',
    'shrink photo', 'enlarge image', 'thumbnail', 'instagram size', 'youtube thumbnail',
    '1080p', '4k', 'redimensionar imagen', 'escalar foto',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif'],
  },
  produces: ['jpg', 'png', 'webp'],
  quickLabel: 'Resize this image',
  load: () => import('./ui'),
});
