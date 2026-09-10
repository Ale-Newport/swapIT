import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/ico',
  name: 'ICO Generator',
  description: 'Build a multi-resolution Windows .ico from any image',
  category: 'images',
  icon: 'AppWindow',
  weight: 42,
  keywords: [
    'ico', 'icon', 'png to ico', 'windows icon', 'app icon', 'multi resolution icon',
    'favicon ico', 'convert to ico', 'crear ico', 'icono de windows', '16x16', '256x256',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif', 'tif', 'tiff'],
    multiple: false,
  },
  produces: ['ico'],
  quickLabel: 'Turn this into an .ico',
  load: () => import('./ui'),
});
