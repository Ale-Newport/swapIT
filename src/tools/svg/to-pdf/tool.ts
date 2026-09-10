import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/to-pdf',
  name: 'SVG to PDF',
  description: 'Put vector artwork on a PDF page at print resolution',
  category: 'svg',
  icon: 'FileOutput',
  weight: 60,
  keywords: [
    'svg to pdf', 'vector to pdf', 'print svg', 'export pdf', 'svg pdf a4', 'letter',
    'poster', 'plotter', 'svg a pdf', 'convertir svg pdf',
  ],
  accepts: { extensions: ['svg'] },
  produces: ['pdf'],
  quickLabel: 'Convert to PDF',
  load: () => import('./ui'),
});
