import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'calculators/storage',
  name: 'Storage Converter',
  description: 'How many photos, songs and videos fit on a drive',
  category: 'calculators',
  icon: 'Database',
  weight: 35,
  standalone: true,
  keywords: [
    'storage', 'how many photos fit', 'sd card capacity', 'hard drive size', 'usable capacity',
    'advertised vs formatted', 'missing gigabytes', 'ssd space', 'hours of video',
    'almacenamiento', 'capacidad de disco',
  ],
  load: () => import('./ui'),
});
