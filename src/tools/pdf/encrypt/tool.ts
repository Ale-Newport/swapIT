import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/encrypt',
  name: 'Encrypt PDF',
  description: 'Lock PDFs with an AES-256 password',
  category: 'pdf',
  icon: 'Lock',
  weight: 55,
  requires: ['qpdf'],
  keywords: [
    'password protect pdf',
    'encrypt pdf',
    'lock pdf',
    'pdf password',
    'secure pdf',
    'aes 256',
    'restrict printing',
    'proteger pdf con contraseña',
    'cifrar pdf',
    'bloquear pdf',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['pdf'],
  quickLabel: 'Password protect this PDF',
  load: () => import('./ui'),
});
