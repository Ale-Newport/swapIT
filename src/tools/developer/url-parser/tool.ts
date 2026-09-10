import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/url-parser',
  name: 'URL Parser',
  description: 'Break a URL into its parts and rebuild it live',
  category: 'developer',
  icon: 'Link',
  weight: 65,
  standalone: true,
  keywords: [
    'url parser',
    'parse url',
    'query parameters',
    'hostname',
    'origin',
    'path segments',
    'link inspector',
    'analizar url',
    'partes de una url',
  ],
  load: () => import('./ui'),
});
