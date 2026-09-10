import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/favicon',
  name: 'Favicon Generator',
  description: 'Make a full favicon set with manifest and HTML snippet',
  category: 'images',
  icon: 'Globe',
  weight: 44,
  keywords: [
    'favicon', 'favicon.ico', 'apple touch icon', 'site webmanifest', 'web icons',
    'pwa icons', 'android chrome icon', 'website icon', 'generar favicon',
    'icono web', 'logo to favicon',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif', 'tif', 'tiff'],
    multiple: false,
  },
  produces: ['ico', 'png'],
  quickLabel: 'Generate favicons from this',
  load: () => import('./ui'),
});
