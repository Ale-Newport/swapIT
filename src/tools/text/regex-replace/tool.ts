import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/regex-replace',
  name: 'Regex Replace',
  description: 'Match with a regular expression and rewrite with $1',
  category: 'text',
  icon: 'Regex',
  weight: 68,
  standalone: true,
  keywords: [
    'regex',
    'regular expression',
    'regexp',
    'pattern replace',
    'capture group',
    'test regex',
    'match text',
    'expresion regular',
    'reemplazo regex',
    'extract with regex',
  ],
  accepts: { kinds: ['text', 'code'], extensions: ['txt', 'csv', 'md', 'log'] },
  quickLabel: 'Run a regex over this file',
  load: () => import('./ui'),
});
