import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/delete-pages',
  name: 'Delete Pages',
  description: 'Remove pages from a PDF and keep the rest',
  category: 'pdf',
  icon: 'FileMinus2',
  weight: 75,
  keywords: [
    'delete pages', 'remove pages', 'drop pages', 'remove blank page', 'trim pdf',
    'take out pages', 'quitar paginas', 'eliminar paginas pdf', 'borrar hojas pdf',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'], multiple: false },
  produces: ['pdf'],
  quickLabel: 'Delete pages from this PDF',
  load: () => import('./ui'),
});
