import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/unzip',
  name: 'Extract Archive',
  description: 'Unpack ZIP, TAR and TAR.GZ archives after previewing them',
  category: 'files',
  icon: 'FolderOpen',
  weight: 72,
  keywords: [
    'unzip', 'extract', 'decompress', 'open zip', 'unpack', 'tar', 'tgz', 'tar.gz',
    'archive contents', 'list zip', 'uncompress',
    'descomprimir', 'extraer zip', 'abrir archivo comprimido',
  ],
  accepts: { extensions: ['zip', 'tar', 'gz', 'tgz'], multiple: false },
  quickLabel: 'Extract this archive',
  load: () => import('./ui'),
});
