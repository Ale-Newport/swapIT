import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/split',
  name: 'Split PDF',
  description: 'Break a PDF into single pages, ranges or fixed-size parts',
  category: 'pdf',
  icon: 'Split',
  weight: 95,
  keywords: [
    'split pdf', 'separate pdf', 'divide pdf', 'burst pdf', 'one file per page',
    'cut pdf', 'chapters', 'page ranges', 'dividir pdf', 'separar pdf', 'partir pdf',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'], multiple: false },
  produces: ['pdf'],
  quickLabel: 'Split this PDF',
  load: () => import('./ui'),
});
