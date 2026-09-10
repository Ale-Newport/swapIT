import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/reorder',
  name: 'Reorder Pages',
  description: 'Drag pages into a new order and rotate them as you go',
  category: 'pdf',
  icon: 'ArrowDownUp',
  weight: 70,
  keywords: [
    'reorder pages', 'rearrange pdf', 'move pages', 'sort pages', 'reverse page order',
    'organise pdf', 'page order', 'reordenar paginas', 'ordenar pdf', 'mover hojas',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'], multiple: false },
  produces: ['pdf'],
  quickLabel: 'Reorder this PDF',
  load: () => import('./ui'),
});
