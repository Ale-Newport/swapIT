import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/flatten',
  name: 'Flatten Folder',
  description: 'Bring every file from nested subfolders into one folder',
  category: 'files',
  icon: 'FolderTree',
  weight: 55,
  keywords: [
    'flatten', 'flatten folder', 'subfolders', 'nested folders', 'single folder',
    'move files out of subfolders', 'merge subfolders', 'un-nest', 'recursive',
    'aplanar carpeta', 'unir subcarpetas', 'sacar archivos de subcarpetas',
  ],
  accepts: { folders: true, multiple: false },
  quickLabel: 'Flatten this folder',
  load: () => import('./ui'),
});
