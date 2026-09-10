import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/dimensions',
  name: 'SVG Dimension Editor',
  description: 'Set or remove the width and height of an SVG',
  category: 'svg',
  icon: 'Ruler',
  weight: 50,
  keywords: [
    'svg size', 'svg width height', 'resize svg', 'scale svg', 'responsive svg',
    'remove width height', 'svg dimensions', 'aspect ratio', 'viewbox size',
    'tamaño svg', 'redimensionar svg',
  ],
  accepts: { extensions: ['svg'], kinds: ['svg'], multiple: false },
  produces: ['svg'],
  quickLabel: 'Resize this SVG',
  load: () => import('./ui'),
});
