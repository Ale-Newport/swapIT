import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/page-numbers',
  name: 'Add Page Numbers',
  description: 'Stamp page numbers onto the pages of a PDF',
  category: 'pdf',
  icon: 'Hash',
  weight: 60,
  keywords: [
    'page numbers', 'number pages', 'paginate', 'pagination', 'add page numbers to pdf',
    'footer', 'header', 'page 1 of 10', 'folio', 'numerar paginas', 'numeros de pagina',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['pdf'],
  quickLabel: 'Add page numbers',
  load: () => import('./ui'),
});
