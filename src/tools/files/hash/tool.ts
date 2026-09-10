import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/hash',
  name: 'Checksum',
  description: 'Check a download against its published checksum',
  category: 'files',
  icon: 'FileDigit',
  weight: 60,
  keywords: [
    'checksum', 'verify download', 'sha256sum', 'integrity', 'md5sum', 'shasum',
    'compare hash', 'corrupted download', 'verificar descarga', 'suma de verificación',
    'comprobar archivo', 'tamper check',
  ],
  accepts: {},
  quickLabel: 'Verify this file',
  load: () => import('./ui'),
});
