import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'calculators/bitrate',
  name: 'Bitrate Calculator',
  description: 'Solve bitrate, duration or file size from the other two',
  category: 'calculators',
  icon: 'Gauge',
  weight: 55,
  standalone: true,
  keywords: [
    'bitrate', 'kbps', 'mbps', 'file size from bitrate', 'video bitrate', 'audio bitrate',
    'encoding', 'streaming bitrate', 'youtube bitrate', 'podcast bitrate', 'tasa de bits',
    'calidad de video',
  ],
  load: () => import('./ui'),
});
