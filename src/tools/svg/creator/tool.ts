import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/creator',
  name: 'Simple SVG Creator',
  description: 'Draw shapes, text and arrows and export them as SVG or PNG',
  category: 'svg',
  icon: 'PenTool',
  weight: 55,
  standalone: true,
  keywords: [
    'draw svg', 'vector editor', 'make svg', 'shapes', 'diagram', 'annotate',
    'arrow', 'rectangle', 'circle', 'polygon', 'sketch', 'wireframe',
    'crear svg', 'dibujar vectores',
  ],
  produces: ['svg', 'png'],
  load: () => import('./ui'),
});
