import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/json-formatter',
  name: 'JSON Formatter',
  description: 'Pretty-print, minify and validate JSON',
  category: 'text',
  icon: 'Braces',
  weight: 90,
  standalone: true,
  keywords: ['json', 'pretty print', 'beautify', 'minify', 'validate', 'format json', 'indent'],
  accepts: { extensions: ['json'], kinds: ['data'] },
  quickLabel: 'Format JSON',
  load: () => import('./ui'),
});
