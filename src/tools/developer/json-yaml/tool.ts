import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/json-yaml',
  name: 'JSON ↔ YAML',
  description: 'Convert JSON to YAML and YAML back to JSON',
  category: 'developer',
  icon: 'ArrowRightLeft',
  weight: 85,
  standalone: true,
  keywords: [
    'json to yaml', 'yaml to json', 'yaml', 'yml', 'json', 'convert yaml',
    'docker compose', 'kubernetes manifest', 'front matter', 'config',
    'convertir yaml', 'json a yaml',
  ],
  // No `accepts`: the two-pane UI takes text, and a file dropped on Home cannot
  // be handed over to it. Dropping a file straight onto the input pane works.
  produces: ['json', 'yaml'],
  load: () => import('./ui'),
});
