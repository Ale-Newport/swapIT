import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/organize',
  name: 'Organize Folder',
  description: 'Sort a folder into subfolders by category or extension',
  category: 'files',
  icon: 'FolderKanban',
  weight: 65,
  keywords: [
    'organize', 'sort files', 'tidy up', 'clean downloads folder', 'by type', 'by extension',
    'file categories', 'group files', 'declutter', 'messy folder',
    'organizar carpeta', 'ordenar archivos', 'clasificar por tipo',
  ],
  accepts: { folders: true, multiple: false },
  quickLabel: 'Organize this folder',
  load: () => import('./ui'),
});
