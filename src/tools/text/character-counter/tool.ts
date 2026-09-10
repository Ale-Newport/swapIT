import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/character-counter',
  name: 'Character Counter',
  description: 'Count characters, words, lines and reading time',
  category: 'text',
  icon: 'Hash',
  weight: 80,
  standalone: true,
  keywords: [
    'character count',
    'word count',
    'count words',
    'how many characters',
    'tweet length',
    '280 characters',
    'meta description length',
    'reading time',
    'line length',
    'sms length',
    'contador de caracteres',
    'contar palabras',
  ],
  accepts: { kinds: ['text'], extensions: ['txt', 'md'] },
  quickLabel: 'Count words and characters',
  load: () => import('./ui'),
});
