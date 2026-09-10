import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/extract-pages',
  name: 'Extract Pages',
  description: 'Pull chosen pages out of a PDF into a new document',
  category: 'pdf',
  icon: 'FileOutput',
  weight: 80,
  keywords: [
    'extract pages', 'pdf pages', 'take pages out', 'save page as pdf', 'select pages',
    'page range', 'copy pages', 'extraer paginas', 'sacar paginas pdf', 'separar hojas',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'], multiple: false },
  produces: ['pdf'],
  quickLabel: 'Extract pages from this PDF',
  load: () => import('./ui'),
});
