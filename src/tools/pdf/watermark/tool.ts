import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/watermark',
  name: 'PDF Watermark',
  description: 'Stamp text or a logo across the pages of a PDF',
  category: 'pdf',
  icon: 'Stamp',
  weight: 62,
  keywords: [
    'watermark', 'stamp', 'draft', 'confidential', 'overlay', 'logo on pdf', 'brand pdf',
    'watermark pdf', 'add text to pdf', 'marca de agua', 'sello', 'copyright',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['pdf'],
  quickLabel: 'Add a watermark',
  load: () => import('./ui'),
});
