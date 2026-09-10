import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/to-images',
  name: 'PDF to Images',
  description: 'Render PDF pages as PNG, JPEG or TIFF images',
  category: 'pdf',
  icon: 'FileImage',
  weight: 92,
  requires: ['pdftoppm'],
  keywords: [
    'pdf to jpg',
    'pdf to png',
    'pdf to image',
    'export pdf pages',
    'rasterize pdf',
    'pdf pages as pictures',
    'tiff',
    'dpi',
    'print resolution',
    'pdf a imagen',
    'pdf a jpg',
    'convertir pdf en imagenes',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['png', 'jpg', 'tiff'],
  quickLabel: 'Turn pages into images',
  load: () => import('./ui'),
});
