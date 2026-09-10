import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/background',
  name: 'Add SVG Background',
  description: 'Put a solid or gradient backdrop behind an SVG',
  category: 'svg',
  icon: 'Square',
  weight: 42,
  keywords: [
    'svg background', 'transparent svg', 'add backdrop', 'gradient background', 'solid colour',
    'rounded corners', 'icon background', 'fill behind logo', 'white background',
    'fondo svg', 'degradado',
  ],
  accepts: { extensions: ['svg'], kinds: ['svg'], multiple: false },
  produces: ['svg'],
  quickLabel: 'Add a background',
  load: () => import('./ui'),
});
