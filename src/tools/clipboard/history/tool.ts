import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'clipboard/history',
  name: 'Clipboard History',
  description: 'Keep, search and paste back the last things you copied',
  category: 'clipboard',
  icon: 'ClipboardList',
  weight: 60,
  standalone: true,
  keywords: [
    'clipboard history', 'copy history', 'paste history', 'recent copies', 'clipboard manager',
    'what did i copy', 'pinned clips', 'past clipboard', 'historial del portapapeles',
    'portapapeles', 'copias recientes',
  ],
  load: () => import('./ui'),
});
