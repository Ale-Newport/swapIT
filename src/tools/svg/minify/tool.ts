import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/minify',
  name: 'SVG Minifier',
  description: 'Squeeze SVG markup down to the smallest safe single line',
  category: 'svg',
  icon: 'Minimize2',
  weight: 44,
  standalone: true,
  keywords: [
    'minify svg', 'compress svg', 'smallest svg', 'svg one line', 'inline svg', 'svgo minify',
    'reduce svg', 'strip whitespace', 'minificar svg', 'comprimir svg',
  ],
  accepts: { extensions: ['svg'], multiple: false },
  produces: ['svg'],
  quickLabel: 'Minify this SVG',
  load: () => import('./ui'),
});
