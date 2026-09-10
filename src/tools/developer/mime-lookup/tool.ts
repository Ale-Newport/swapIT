import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/mime-lookup',
  name: 'MIME Type Lookup',
  description: 'Find the MIME type for a file extension, or the reverse',
  category: 'developer',
  icon: 'FileQuestion',
  weight: 44,
  standalone: true,
  keywords: [
    'mime type',
    'content type',
    'media type',
    'file extension',
    'mime lookup',
    'content-type header',
    'tipo mime',
    'extension de archivo',
  ],
  load: () => import('./ui'),
});
