import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'calculators/transfer-time',
  name: 'Transfer Time Calculator',
  description: 'How long a download or copy takes at a given speed',
  category: 'calculators',
  icon: 'ArrowDownUp',
  weight: 38,
  standalone: true,
  keywords: [
    'transfer time', 'download time', 'upload time', 'mbps to mb/s', 'how long to download',
    'copy time', 'usb 3 speed', 'thunderbolt', 'gigabit', 'wifi speed', 'bandwidth',
    'tiempo de descarga', 'velocidad de transferencia',
  ],
  load: () => import('./ui'),
});
