import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/watermark',
  name: 'Image Watermark',
  description: 'Stamp text or a logo onto images in batches',
  category: 'images',
  icon: 'Stamp',
  weight: 60,
  keywords: [
    'watermark', 'logo', 'copyright', 'brand photos', 'signature', 'stamp',
    'protect images', 'batch watermark', 'overlay text', 'marca de agua', 'logotipo',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp'],
  },
  produces: ['jpg', 'png', 'webp'],
  quickLabel: 'Watermark this image',
  load: () => import('./ui'),
});
