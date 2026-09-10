import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/change-extension',
  name: 'Change File Extension',
  description: 'Rename files to another extension without converting',
  category: 'files',
  icon: 'FilePen',
  weight: 40,
  keywords: [
    'change extension', 'rename extension', 'file extension', 'jpeg to jpg', 'wrong extension',
    'batch extension', 'txt to md', 'cambiar extensión', 'renombrar extensión', 'extensión de archivo',
    'suffix', 'rename suffix',
  ],
  accepts: {},
  quickLabel: 'Change the extension',
  load: () => import('./ui'),
});
