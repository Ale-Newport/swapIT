import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/sort-lines',
  name: 'Sort Lines',
  description: 'Sort lines alphabetically, numerically or by length',
  category: 'text',
  icon: 'ArrowDownAZ',
  weight: 65,
  standalone: true,
  keywords: [
    'sort',
    'alphabetical order',
    'sort list',
    'natural sort',
    'sort numbers',
    'shuffle lines',
    'reverse lines',
    'a-z',
    'ordenar lineas',
    'orden alfabetico',
  ],
  accepts: { kinds: ['text'], extensions: ['txt', 'csv', 'md'] },
  quickLabel: 'Sort these lines',
  load: () => import('./ui'),
});
