import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/regex-tester',
  name: 'Regex Tester',
  description: 'Test a regular expression live with matches and groups',
  category: 'developer',
  icon: 'Regex',
  weight: 78,
  standalone: true,
  keywords: [
    'regex',
    'regular expression',
    'regexp',
    'pattern matching',
    'capture groups',
    'test regex',
    'replace',
    'expresion regular',
    'probar regex',
  ],
  load: () => import('./ui'),
});
