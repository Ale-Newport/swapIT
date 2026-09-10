import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/to-base64',
  name: 'Image to Base64',
  description: 'Turn an image into a Base64 data URL for CSS or HTML',
  category: 'images',
  icon: 'FileCode2',
  weight: 40,
  keywords: [
    'base64', 'data url', 'data uri', 'inline image', 'encode image', 'img src',
    'css background', 'embed image', 'image to base64', 'imagen a base64',
    'codificar base64',
  ],
  accepts: {
    kinds: ['image', 'svg'],
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'ico', 'svg', 'tif', 'tiff', 'heic'],
    multiple: false,
  },
  quickLabel: 'Encode as Base64',
  load: () => import('./ui'),
});
