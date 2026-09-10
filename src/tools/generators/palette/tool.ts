import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'generators/palette',
  name: 'Palette Generator',
  description: 'Build a colour scheme from one base colour',
  category: 'generators',
  icon: 'Palette',
  weight: 60,
  standalone: true,
  keywords: [
    'palette', 'color palette', 'colour scheme', 'complementary', 'analogous', 'triadic',
    'monochromatic', 'shades', 'tints', 'brand colors', 'tailwind colors', 'css variables',
    'paleta de colores', 'combinación de colores',
  ],
  load: () => import('./ui'),
});
