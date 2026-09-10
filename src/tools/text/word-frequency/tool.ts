import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/word-frequency',
  name: 'Word Frequency',
  description: 'Rank the most used words and export the counts',
  category: 'text',
  icon: 'ChartBarBig',
  weight: 35,
  standalone: true,
  keywords: [
    'word frequency',
    'most used words',
    'word count by word',
    'keyword density',
    'text analysis',
    'stop words',
    'frecuencia de palabras',
    'palabras mas usadas',
    'tag cloud data',
    'seo keywords',
  ],
  accepts: { kinds: ['text'], extensions: ['txt', 'md', 'csv'] },
  produces: ['csv'],
  quickLabel: 'Count word frequency',
  load: () => import('./ui'),
});
