import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/remove-metadata',
  name: 'Remove Image Metadata',
  description: 'Strip EXIF, GPS and camera data out of photos',
  category: 'images',
  icon: 'ShieldOff',
  weight: 75,
  keywords: [
    'exif', 'remove exif', 'strip exif', 'gps', 'geotag', 'location', 'privacy',
    'metadata', 'scrub photo', 'anonymize image', 'before posting', 'quitar exif',
    'metadatos', 'borrar ubicación',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['jpg', 'jpeg', 'heic', 'heif', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp'],
  },
  produces: ['jpg', 'png', 'webp', 'tiff', 'avif'],
  quickLabel: 'Strip metadata',
  load: () => import('./ui'),
});
