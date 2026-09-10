import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/slugify',
  name: 'Slugify Text',
  description: 'Turn titles into clean URL slugs, one per line',
  category: 'text',
  icon: 'Link2',
  weight: 40,
  standalone: true,
  keywords: [
    'slug',
    'url slug',
    'permalink',
    'seo url',
    'remove accents',
    'filename safe',
    'kebab case url',
    'convertir a url',
    'quitar acentos',
    'amigable',
  ],
  accepts: { kinds: ['text'], extensions: ['txt', 'csv', 'md'] },
  quickLabel: 'Slugify these lines',
  load: () => import('./ui'),
});
