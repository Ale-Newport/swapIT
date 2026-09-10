import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/decrypt',
  name: 'Remove PDF Password',
  description: 'Save an unlocked copy of a PDF you can already open',
  category: 'pdf',
  icon: 'LockOpen',
  weight: 54,
  requires: ['qpdf'],
  keywords: [
    'remove pdf password',
    'unlock pdf',
    'decrypt pdf',
    'pdf password remover',
    'open protected pdf',
    'stop asking for password',
    'quitar contraseña pdf',
    'desbloquear pdf',
    'descifrar pdf',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['pdf'],
  quickLabel: 'Remove the password',
  load: () => import('./ui'),
});
