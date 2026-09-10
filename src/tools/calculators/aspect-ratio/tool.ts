import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'calculators/aspect-ratio',
  name: 'Aspect Ratio Calculator',
  description: 'Solve width, height and ratio, and fit inside a box',
  category: 'calculators',
  icon: 'RectangleHorizontal',
  weight: 70,
  standalone: true,
  keywords: [
    'aspect ratio', 'ratio', '16:9', '4:3', '21:9', '9:16', 'resize proportionally',
    'scale dimensions', 'fit inside', 'contain', 'cover', 'letterbox', 'relacion de aspecto',
    'proporcion',
  ],
  load: () => import('./ui'),
});
