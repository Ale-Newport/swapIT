import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'generators/gradient',
  name: 'Gradient Generator',
  description: 'Design a CSS gradient and export it as PNG or SVG',
  category: 'generators',
  icon: 'Blend',
  weight: 45,
  standalone: true,
  keywords: [
    'gradient', 'css gradient', 'linear gradient', 'radial gradient', 'conic gradient',
    'background', 'color stops', 'gradient generator', 'degradado', 'fondo degradado',
  ],
  produces: ['png', 'svg', 'css'],
  load: () => import('./ui'),
});
