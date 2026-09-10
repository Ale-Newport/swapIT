import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/json-validator',
  name: 'JSON Validator',
  description: 'Check JSON and explain exactly where it breaks',
  category: 'text',
  icon: 'CircleCheckBig',
  weight: 70,
  standalone: true,
  keywords: [
    'json', 'validate', 'validator', 'json error', 'syntax error', 'lint json', 'check json',
    'duplicate keys', 'is my json valid', 'validar json', 'json depth', 'parse error',
    'jsonc', 'json with comments', 'trailing comma',
  ],
  accepts: { extensions: ['json', 'jsonc', 'geojson'], kinds: ['data'] },
  quickLabel: 'Validate this JSON',
  load: () => import('./ui'),
});
