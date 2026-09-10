import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'generators/random-color',
  name: 'Random Color',
  description: 'Random swatches — pastel, vivid, dark or by hue',
  category: 'generators',
  icon: 'Shuffle',
  weight: 40,
  standalone: true,
  keywords: [
    'random color', 'random colour', 'color generator', 'pastel colors', 'vivid colors',
    'hex color', 'rgb', 'hsl', 'swatch', 'color picker', 'color aleatorio', 'colores al azar',
  ],
  load: () => import('./ui'),
});
