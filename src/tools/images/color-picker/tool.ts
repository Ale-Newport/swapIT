import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/color-picker',
  name: 'Color Picker',
  description: 'Sample any pixel of an image as HEX, RGB and HSL',
  category: 'images',
  icon: 'Pipette',
  weight: 45,
  keywords: [
    'eyedropper', 'color picker', 'pick colour from image', 'hex code from photo',
    'rgb', 'hsl', 'sample pixel', 'get color from screenshot', 'cuentagotas',
    'selector de color', 'color de una imagen',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif', 'tif', 'tiff'],
    multiple: false,
  },
  quickLabel: 'Pick a colour from this image',
  load: () => import('./ui'),
});
