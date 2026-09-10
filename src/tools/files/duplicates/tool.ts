import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/duplicates',
  name: 'Duplicate Finder',
  description: 'Find byte-identical files and the space they waste',
  category: 'files',
  icon: 'CopyCheck',
  weight: 80,
  keywords: [
    'duplicates', 'duplicate files', 'find duplicates', 'dedupe', 'identical files', 'copies',
    'free up space', 'wasted space', 'same photo twice', 'archivos duplicados', 'duplicados',
    'buscar duplicados', 'disk space',
  ],
  accepts: { folders: true, multiple: true },
  quickLabel: 'Find duplicates in this folder',
  load: () => import('./ui'),
});
