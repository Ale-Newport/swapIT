import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/optimize',
  name: 'SVG Optimizer',
  description: 'Shrink SVG files with SVGO without changing how they look',
  category: 'svg',
  icon: 'Zap',
  weight: 95,
  keywords: [
    'svgo', 'optimize svg', 'optimise svg', 'compress svg', 'clean svg', 'shrink svg',
    'reduce svg size', 'remove metadata', 'inkscape cleanup', 'illustrator cleanup',
    'optimizar svg', 'comprimir svg',
  ],
  accepts: { extensions: ['svg'] },
  produces: ['svg'],
  quickLabel: 'Optimize this SVG',
  load: () => import('./ui'),
});
