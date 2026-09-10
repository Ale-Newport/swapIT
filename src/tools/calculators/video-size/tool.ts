import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'calculators/video-size',
  name: 'Video Size Estimator',
  description: 'Estimate output size from resolution, codec and length',
  category: 'calculators',
  icon: 'FileVideo',
  weight: 50,
  standalone: true,
  keywords: [
    'video size', 'how big will my video be', 'h264', 'h265', 'hevc', 'vp9', 'av1',
    'export size', 'render size', '4k file size', 'bits per pixel', 'target size',
    'tamano de video', 'estimar video',
  ],
  load: () => import('./ui'),
});
