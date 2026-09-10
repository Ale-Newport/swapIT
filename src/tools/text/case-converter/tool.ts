import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/case-converter',
  name: 'Case Converter',
  description: 'Switch text between 13 capitalisation styles',
  category: 'text',
  icon: 'CaseSensitive',
  weight: 90,
  standalone: true,
  keywords: [
    'uppercase',
    'lowercase',
    'title case',
    'sentence case',
    'camelcase',
    'snake_case',
    'kebab-case',
    'pascalcase',
    'capitalize',
    'change case',
    'mayusculas',
    'minusculas',
  ],
  accepts: { kinds: ['text'], extensions: ['txt', 'md', 'csv'] },
  quickLabel: 'Change text case',
  load: () => import('./ui'),
});
