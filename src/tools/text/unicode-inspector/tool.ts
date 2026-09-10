import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/unicode-inspector',
  name: 'Unicode Inspector',
  description: 'See every code point, byte and hidden character in a string',
  category: 'text',
  icon: 'Braces',
  weight: 45,
  standalone: true,
  keywords: [
    'unicode',
    'code point',
    'utf-8',
    'utf-16',
    'hidden characters',
    'zero width space',
    'invisible characters',
    'emoji length',
    'grapheme',
    'character map',
    'caracteres invisibles',
    'inspeccionar unicode',
  ],
  quickLabel: 'Inspect characters',
  load: () => import('./ui'),
});
