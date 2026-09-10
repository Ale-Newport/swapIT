import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/metadata-viewer',
  name: 'Image Metadata',
  description: 'See every EXIF tag, GPS fix and camera setting',
  category: 'images',
  icon: 'Info',
  weight: 55,
  keywords: [
    'exif', 'exif viewer', 'metadata', 'image info', 'dimensions', 'megapixels',
    'gps', 'camera settings', 'iso', 'shutter speed', 'read exif', 'ver metadatos',
    'información de imagen',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['jpg', 'jpeg', 'heic', 'heif', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif'],
    multiple: false,
  },
  quickLabel: 'Inspect metadata',
  load: () => import('./ui'),
});
