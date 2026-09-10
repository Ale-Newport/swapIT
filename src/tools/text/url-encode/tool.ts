import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/url-encode',
  name: 'URL Encode / Decode',
  description: 'Percent-encode or decode URLs, query values and form fields',
  category: 'text',
  icon: 'Link',
  weight: 65,
  standalone: true,
  keywords: [
    'url encode',
    'url decode',
    'percent encoding',
    'encodeuricomponent',
    'query string',
    'escape url',
    'unescape',
    'form urlencoded',
    'codificar url',
    'decodificar url',
    '%20',
  ],
  quickLabel: 'Encode a URL',
  load: () => import('./ui'),
});
