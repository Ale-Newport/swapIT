import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/palette',
  name: 'Color Palette Extractor',
  description: 'Pull the dominant colours out of an image',
  category: 'images',
  icon: 'Palette',
  weight: 48,
  keywords: [
    'palette', 'dominant colors', 'color scheme', 'extract colors', 'swatches',
    'brand colors from image', 'css variables', 'tailwind colors', 'paleta de colores',
    'colores dominantes', 'moodboard',
  ],
  accepts: {
    kinds: ['image'],
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif', 'tif', 'tiff'],
    multiple: false,
  },
  quickLabel: 'Extract its colour palette',
  load: () => import('./ui'),
});
