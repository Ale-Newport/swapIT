import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/find-replace',
  name: 'Find and Replace',
  description: 'Replace text everywhere, with a highlighted preview',
  category: 'text',
  icon: 'Replace',
  weight: 70,
  standalone: true,
  keywords: [
    'find and replace',
    'search and replace',
    'replace text',
    'swap words',
    'whole word',
    'bulk edit text',
    'buscar y reemplazar',
    'reemplazar texto',
    'substitute',
  ],
  accepts: { kinds: ['text', 'code'], extensions: ['txt', 'csv', 'md'] },
  quickLabel: 'Find and replace in this file',
  load: () => import('./ui'),
});
