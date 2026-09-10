import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/query-string',
  name: 'Query String Parser',
  description: 'Split a query string into parameters and build it back',
  category: 'developer',
  icon: 'ListTree',
  weight: 55,
  standalone: true,
  keywords: [
    'query string',
    'url parameters',
    'querystring',
    'search params',
    'utm',
    'parse query',
    'build query string',
    'parametros url',
    'cadena de consulta',
  ],
  load: () => import('./ui'),
});
