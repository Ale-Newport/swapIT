import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/contact-sheet',
  name: 'Contact Sheet',
  description: 'Lay images out as one printable thumbnail sheet',
  category: 'images',
  icon: 'LayoutGrid',
  weight: 50,
  keywords: [
    'contact sheet', 'thumbnail grid', 'photo grid', 'proof sheet', 'montage',
    'collage', 'index sheet', 'combine images', 'mosaic', 'hoja de contactos',
    'mosaico de fotos',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['jpg', 'jpeg', 'heic', 'heif', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif'],
  },
  produces: ['png'],
  quickLabel: 'Build a contact sheet',
  load: () => import('./ui'),
});
