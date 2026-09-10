import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'generators/placeholder-image',
  name: 'Placeholder Image',
  description: 'Make a sized placeholder PNG without going online',
  category: 'generators',
  icon: 'ImagePlus',
  weight: 42,
  standalone: true,
  keywords: [
    'placeholder image', 'dummy image', 'mockup image', 'placeholder png', 'image placeholder',
    'og image size', 'wireframe image', 'grey box', 'imagen de relleno', 'imagen de ejemplo',
  ],
  produces: ['png'],
  load: () => import('./ui'),
});
