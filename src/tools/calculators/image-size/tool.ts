import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'calculators/image-size',
  name: 'Image Size Calculator',
  description: 'Megapixels, raw size and compressed estimates',
  category: 'calculators',
  icon: 'Image',
  weight: 42,
  standalone: true,
  keywords: [
    'image size', 'megapixels', 'uncompressed size', 'bit depth', 'jpeg size', 'png size',
    'webp size', 'memory footprint', 'raw image size', 'how big is my photo',
    'tamano de imagen', 'megapixeles',
  ],
  load: () => import('./ui'),
});
