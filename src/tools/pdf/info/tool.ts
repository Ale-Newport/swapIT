import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/info',
  name: 'PDF Inspector',
  description: 'Page count, size, security and every document property',
  category: 'pdf',
  icon: 'FileSearch',
  weight: 48,
  requires: ['pdftotext'],
  keywords: [
    'page counter',
    'pdf page count',
    'how many pages',
    'count pages',
    'pdf size',
    'pdf properties',
    'pdf version',
    'is this pdf encrypted',
    'page dimensions',
    'a4 or letter',
    'contar paginas pdf',
    'informacion pdf',
    'propiedades del pdf',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  quickLabel: 'Count pages and inspect',
  load: () => import('./ui'),
});
