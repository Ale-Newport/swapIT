import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/http-status',
  name: 'HTTP Status Codes',
  description: 'Search every HTTP status code and what it means',
  category: 'developer',
  icon: 'ServerCog',
  weight: 45,
  standalone: true,
  keywords: [
    'http status',
    'status codes',
    '404',
    '500',
    '429 rate limit',
    'response codes',
    'rest api',
    'codigos http',
    'error 404 significado',
  ],
  load: () => import('./ui'),
});
