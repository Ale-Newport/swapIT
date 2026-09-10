import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/viewbox',
  name: 'SVG ViewBox Tool',
  description: 'Edit the viewBox, crop the frame or fit it to the artwork',
  category: 'svg',
  icon: 'Crop',
  weight: 48,
  keywords: [
    'viewbox', 'svg crop', 'trim svg', 'fit to content', 'bounding box', 'svg padding',
    'centre svg', 'svg whitespace', 'remove empty space', 'coordinate system',
    'recortar svg', 'marco svg',
  ],
  accepts: { extensions: ['svg'], multiple: false },
  produces: ['svg'],
  quickLabel: 'Edit the viewBox',
  load: () => import('./ui'),
});
