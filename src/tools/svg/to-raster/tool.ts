import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/to-raster',
  name: 'SVG to PNG or JPG',
  description: 'Render vectors to pixels at any size, 1x to 4x or exact',
  category: 'svg',
  icon: 'FileImage',
  weight: 85,
  keywords: [
    'svg to png', 'svg to jpg', 'svg to jpeg', 'rasterize svg', 'render svg', 'vector to image',
    'export svg', 'svg 2x', 'retina', 'convert svg', 'svg a png', 'svg a jpg',
  ],
  accepts: { extensions: ['svg'] },
  produces: ['png', 'jpg'],
  quickLabel: 'Convert to PNG',
  load: () => import('./ui'),
});
