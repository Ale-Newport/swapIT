import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/file-hash',
  name: 'File Hash',
  description: 'Checksum files and verify a download against its hash',
  category: 'developer',
  icon: 'FileDigit',
  weight: 74,
  keywords: [
    'checksum', 'file hash', 'md5', 'sha1', 'sha256', 'sha512', 'verify download',
    'shasum', 'integrity', 'compare hash', 'verificar descarga', 'suma sha256',
  ],
  accepts: {},
  quickLabel: 'Hash these files',
  load: () => import('./ui'),
});
