import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/icon-generator',
  name: 'SVG Icon Generator',
  description: 'Build an app icon or avatar from initials, an emoji or a glyph',
  category: 'svg',
  icon: 'Shapes',
  weight: 40,
  standalone: true,
  keywords: [
    'icon generator', 'app icon', 'avatar', 'initials', 'monogram', 'favicon',
    'placeholder icon', 'logo mark', 'emoji icon', 'gradient icon', 'png icon',
    'generar icono', 'iniciales',
  ],
  produces: ['svg', 'png'],
  load: () => import('./ui'),
});
