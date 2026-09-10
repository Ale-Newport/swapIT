import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/color-converter',
  name: 'Color Converter',
  description: 'Convert HEX, RGB, HSL, HSV and CMYK with contrast checks',
  category: 'developer',
  icon: 'Palette',
  weight: 68,
  standalone: true,
  keywords: [
    'color converter',
    'hex to rgb',
    'rgb to hex',
    'hsl',
    'hsv',
    'cmyk',
    'contrast ratio',
    'wcag',
    'accessibility',
    'tints and shades',
    'convertir color',
    'colores hexadecimal',
  ],
  load: () => import('./ui'),
});
