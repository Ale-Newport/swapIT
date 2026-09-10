import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/split',
  name: 'Split Large File',
  description: 'Cut a big file into numbered parts you can rejoin later',
  category: 'files',
  icon: 'Split',
  weight: 45,
  keywords: [
    'split', 'split file', 'chunk', 'large file', 'split iso', 'fat32 4gb limit',
    'email attachment size', 'usb stick', 'dvd', 'parts',
    'dividir archivo', 'partir archivo', 'trocear',
  ],
  accepts: { multiple: false },
  produces: ['part'],
  quickLabel: 'Split this file',
  load: () => import('./ui'),
});
