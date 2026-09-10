import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'clipboard/save-image',
  name: 'Save Clipboard Image',
  description: 'Turn a copied picture into a PNG or JPEG file',
  category: 'clipboard',
  icon: 'ImageDown',
  weight: 55,
  standalone: true,
  keywords: [
    'save clipboard image', 'paste image to file', 'clipboard to png', 'clipboard to jpg',
    'copied screenshot', 'paste screenshot', 'save copied picture', 'guardar imagen del portapapeles',
    'pegar imagen', 'imagen del portapapeles', 'captura pegada',
  ],
  produces: ['png', 'jpg'],
  load: () => import('./ui'),
});
