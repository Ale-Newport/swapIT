import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/rotate',
  name: 'Rotate PDF Pages',
  description: 'Turn pages 90, 180 or 270 degrees across a whole batch',
  category: 'pdf',
  icon: 'RotateCw',
  weight: 65,
  keywords: [
    'rotate pdf', 'turn pages', 'sideways pdf', 'upside down pdf', 'landscape portrait',
    'fix orientation', 'scanned sideways', 'girar pdf', 'rotar paginas', 'voltear pdf',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['pdf'],
  quickLabel: 'Rotate these pages',
  load: () => import('./ui'),
});
