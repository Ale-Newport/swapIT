import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/merge',
  name: 'Merge PDFs',
  description: 'Combine several PDFs into one, in the order you choose',
  category: 'pdf',
  icon: 'Combine',
  weight: 100,
  keywords: [
    'merge pdf', 'combine pdf', 'join pdf', 'append pdf', 'concatenate pdf', 'pdf merger',
    'two pdfs into one', 'stitch documents', 'unir pdf', 'combinar pdf', 'juntar pdf',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['pdf'],
  quickLabel: 'Merge with other PDFs',
  load: () => import('./ui'),
});
