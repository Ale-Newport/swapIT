import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/batch-rename',
  name: 'Batch Rename',
  description: 'Rename hundreds of files with rules and a live preview',
  category: 'files',
  icon: 'FileType2',
  weight: 95,
  keywords: [
    'rename', 'batch rename', 'bulk rename', 'rename files', 'numbering', 'sequence',
    'find and replace', 'regex rename', 'slugify', 'prefix', 'suffix', 'renombrar archivos',
    'renombrar en lote', 'cambiar nombre',
  ],
  // Any file, like its sibling files/change-extension. Declaring `folders` alone
  // would opt the tool out of every file match, hiding the quick action below.
  accepts: {},
  quickLabel: 'Batch rename these files',
  load: () => import('./ui'),
});
