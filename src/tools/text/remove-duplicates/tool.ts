import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/remove-duplicates',
  name: 'Remove Duplicate Lines',
  description: 'Keep one copy of each line, or list only the repeats',
  category: 'text',
  icon: 'ListX',
  weight: 60,
  standalone: true,
  keywords: [
    'duplicate lines',
    'remove duplicates',
    'dedupe',
    'unique lines',
    'find duplicates',
    'repeated lines',
    'clean list',
    'eliminar duplicados',
    'lineas repetidas',
    'email list',
  ],
  accepts: { kinds: ['text'], extensions: ['txt', 'csv', 'md'] },
  quickLabel: 'Remove duplicate lines',
  load: () => import('./ui'),
});
