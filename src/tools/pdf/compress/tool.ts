import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/compress',
  name: 'Compress PDF',
  description: 'Shrink PDFs for email, upload or archiving',
  category: 'pdf',
  icon: 'Minimize2',
  weight: 90,
  requires: ['gs'],
  keywords: [
    'compress pdf',
    'reduce pdf size',
    'shrink pdf',
    'make pdf smaller',
    'pdf too large to email',
    'optimize pdf',
    'downsample images',
    'ghostscript',
    'comprimir pdf',
    'reducir tamaño pdf',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['pdf'],
  quickLabel: 'Make this PDF smaller',
  load: () => import('./ui'),
});
