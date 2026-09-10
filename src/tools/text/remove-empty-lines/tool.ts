import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/remove-empty-lines',
  name: 'Remove Empty Lines',
  description: 'Drop blank lines or collapse runs of them into one',
  category: 'text',
  icon: 'Rows3',
  weight: 50,
  standalone: true,
  keywords: [
    'blank lines',
    'empty lines',
    'remove line breaks',
    'delete blank rows',
    'compact text',
    'double spacing',
    'eliminar lineas vacias',
    'quitar saltos de linea',
    'clean up text',
  ],
  accepts: { kinds: ['text'], extensions: ['txt', 'csv', 'md'] },
  quickLabel: 'Remove empty lines',
  load: () => import('./ui'),
});
