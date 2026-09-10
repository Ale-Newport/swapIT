import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'generators/lorem',
  name: 'Lorem Ipsum',
  description: 'Placeholder copy in Latin or plain English',
  category: 'generators',
  icon: 'Text',
  weight: 55,
  standalone: true,
  keywords: [
    'lorem ipsum', 'lorem', 'placeholder text', 'dummy text', 'filler text', 'mockup copy',
    'greeking', 'sample paragraphs', 'texto de relleno', 'texto de ejemplo',
  ],
  produces: ['txt', 'html'],
  load: () => import('./ui'),
});
