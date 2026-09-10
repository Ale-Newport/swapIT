import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/html-to-markdown',
  name: 'HTML to Markdown',
  description: 'Turn web page HTML into clean Markdown',
  category: 'text',
  icon: 'ArrowRightLeft',
  weight: 55,
  standalone: true,
  keywords: [
    'html to markdown', 'html', 'markdown', 'md', 'convert html', 'web page to markdown',
    'strip tags', 'readme', 'html a markdown', 'convertir html', 'paste as markdown',
  ],
  accepts: { extensions: ['html', 'htm', 'xhtml'], kinds: ['code', 'text'] },
  produces: ['md'],
  quickLabel: 'Convert this HTML to Markdown',
  load: () => import('./ui'),
});
