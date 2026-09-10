import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/secure-delete',
  name: 'Secure Delete',
  description: 'Overwrite files and remove them without using the Trash',
  category: 'files',
  icon: 'ShieldX',
  weight: 20,
  keywords: [
    'secure delete', 'shred', 'wipe', 'erase', 'overwrite', 'permanently delete',
    'destroy file', 'skip the trash', 'srm', 'unrecoverable',
    'borrado seguro', 'eliminar permanentemente', 'triturar archivo',
  ],
  accepts: { multiple: true },
  quickLabel: 'Securely delete',
  load: () => import('./ui'),
});
