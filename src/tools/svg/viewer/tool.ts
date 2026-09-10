import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/viewer',
  name: 'SVG Viewer',
  description: 'Preview an SVG and inspect its size, structure and safety',
  category: 'svg',
  icon: 'Eye',
  weight: 70,
  keywords: [
    'svg viewer', 'open svg', 'preview svg', 'inspect svg', 'svg source', 'view vector',
    'svg dimensions', 'viewbox', 'svg script', 'is this svg safe', 'ver svg', 'abrir svg',
  ],
  accepts: { extensions: ['svg'], multiple: false },
  quickLabel: 'View this SVG',
  load: () => import('./ui'),
});
