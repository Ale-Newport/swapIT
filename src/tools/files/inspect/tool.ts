import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/inspect',
  name: 'Inspect File',
  description: 'Everything Toolbox can tell you about one file',
  category: 'files',
  icon: 'FileSearch',
  weight: 70,
  keywords: [
    'inspect', 'what is this file', 'file details', 'identify', 'probe', 'dimensions',
    'codec', 'page count', 'archive contents', 'preview', 'inspeccionar', 'analizar archivo',
    'qué es este archivo', 'file type',
  ],
  accepts: { multiple: false },
  quickLabel: 'Inspect this file',
  load: () => import('./ui'),
});
