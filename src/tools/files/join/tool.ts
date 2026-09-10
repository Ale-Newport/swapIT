import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/join',
  name: 'Join Split Files',
  description: 'Rebuild one file from its numbered .part pieces',
  category: 'files',
  icon: 'Combine',
  weight: 44,
  keywords: [
    'join', 'merge parts', 'combine files', 'rejoin', 'reassemble', 'concatenate',
    '001 part', 'split parts', 'put file back together', 'cat files',
    'unir partes', 'juntar archivos', 'reconstruir archivo',
  ],
  accepts: { multiple: true },
  quickLabel: 'Join these parts',
  load: () => import('./ui'),
});
