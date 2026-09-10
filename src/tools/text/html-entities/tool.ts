import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/html-entities',
  name: 'HTML Entities',
  description: 'Escape and unescape HTML entities, named or numeric',
  category: 'text',
  icon: 'Code',
  weight: 55,
  standalone: true,
  keywords: [
    'html entities',
    'escape html',
    'unescape html',
    'amp',
    'nbsp',
    'special characters',
    'encode html',
    'decode html',
    'xml escape',
    'entidades html',
    'escapar html',
  ],
  accepts: { extensions: ['html', 'htm', 'xml'], kinds: ['code'] },
  quickLabel: 'Escape HTML entities',
  load: () => import('./ui'),
});
