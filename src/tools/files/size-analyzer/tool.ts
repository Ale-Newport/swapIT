import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/size-analyzer',
  name: 'Folder Size Analyzer',
  description: 'See what is actually taking up space in a folder',
  category: 'files',
  icon: 'ChartPie',
  weight: 85,
  keywords: [
    'disk usage', 'folder size', 'what is using my disk', 'biggest files', 'largest files',
    'free up space', 'storage', 'analyze folder', 'du', 'tamaño de carpeta', 'espacio en disco',
    'archivos grandes', 'disk space',
  ],
  accepts: { folders: true, multiple: false },
  quickLabel: 'Analyze this folder',
  load: () => import('./ui'),
});
