import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/from-base64',
  name: 'Base64 to Image',
  description: 'Decode a Base64 string or data URL back into an image',
  category: 'images',
  icon: 'ImageDown',
  weight: 38,
  standalone: true,
  keywords: [
    'base64 to image', 'decode base64', 'data url', 'data uri', 'save data url',
    'paste base64', 'base64 png', 'base64 jpg', 'base64 a imagen', 'decodificar base64',
  ],
  produces: ['png', 'jpg', 'gif', 'webp', 'svg'],
  quickLabel: 'Decode Base64 to an image',
  load: () => import('./ui'),
});
