import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/trim-whitespace',
  name: 'Trim Whitespace',
  description: 'Trim, collapse and clean invisible characters out of text',
  category: 'text',
  icon: 'Eraser',
  weight: 48,
  standalone: true,
  keywords: [
    'trim spaces',
    'trailing whitespace',
    'remove tabs',
    'tabs to spaces',
    'spaces to tabs',
    'zero width space',
    'non breaking space',
    'nbsp',
    'line endings',
    'crlf to lf',
    'quitar espacios',
    'limpiar texto',
  ],
  accepts: { kinds: ['text', 'code'], extensions: ['txt', 'csv', 'md'] },
  quickLabel: 'Clean up whitespace',
  load: () => import('./ui'),
});
