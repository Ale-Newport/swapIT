import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/crop',
  name: 'Crop Image',
  description: 'Cut an image down to a selected area',
  category: 'images',
  icon: 'Crop',
  weight: 80,
  keywords: [
    'crop', 'cut image', 'trim photo', 'square crop', 'aspect ratio', '16:9', '1:1',
    'profile picture', 'remove edges', 'recortar imagen', 'cortar foto',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif'],
    multiple: false,
  },
  // No format control: a crop is written back in the input's own format.
  quickLabel: 'Crop this image',
  load: () => import('./ui'),
});
