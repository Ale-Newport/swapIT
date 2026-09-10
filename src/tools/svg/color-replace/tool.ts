import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/color-replace',
  name: 'SVG Color Replacer',
  description: 'Find every colour in an SVG and swap it for another',
  category: 'svg',
  icon: 'Palette',
  weight: 65,
  keywords: [
    'svg colour', 'svg color', 'recolor svg', 'change svg color', 'replace color',
    'icon color', 'monochrome icon', 'tint svg', 'brand colors', 'fill stroke',
    'cambiar color svg', 'recolorear svg',
  ],
  accepts: { extensions: ['svg'], kinds: ['svg'], multiple: false },
  produces: ['svg'],
  quickLabel: 'Recolour this SVG',
  load: () => import('./ui'),
});
