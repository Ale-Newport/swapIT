import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/zip',
  name: 'Create ZIP',
  description: 'Compress files and folders into a ZIP, TAR or TAR.GZ',
  category: 'files',
  icon: 'FileArchive',
  weight: 70,
  keywords: [
    'zip', 'compress', 'archive', 'tar', 'tar.gz', 'tgz', 'create zip',
    'make a zip file', 'compress folder', 'email attachment',
    'comprimir', 'crear zip', 'archivo comprimido',
  ],
  accepts: {
    folders: true,
    kinds: ['image', 'svg', 'video', 'audio', 'pdf', 'document', 'archive', 'text', 'data', 'code', 'font', 'other'],
  },
  produces: ['zip', 'tar', 'tar.gz'],
  quickLabel: 'Compress into a ZIP',
  load: () => import('./ui'),
});
