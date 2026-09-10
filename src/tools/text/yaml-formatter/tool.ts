import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/yaml-formatter',
  name: 'YAML Formatter',
  description: 'Tidy YAML and convert it to or from JSON',
  category: 'text',
  icon: 'FileCode2',
  weight: 58,
  standalone: true,
  keywords: [
    'yaml', 'yml', 'format yaml', 'validate yaml', 'yaml to json', 'json to yaml', 'indent',
    'sort keys', 'docker compose', 'kubernetes', 'front matter', 'formatear yaml',
  ],
  accepts: { extensions: ['yaml', 'yml', 'json'], kinds: ['data'] },
  produces: ['yaml', 'json'],
  quickLabel: 'Format this YAML',
  load: () => import('./ui'),
});
