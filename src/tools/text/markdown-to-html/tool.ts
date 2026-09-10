import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/markdown-to-html',
  name: 'Markdown to HTML',
  description: 'Render Markdown as HTML or a complete web page',
  category: 'text',
  icon: 'CodeXml',
  weight: 54,
  standalone: true,
  keywords: [
    'markdown to html', 'md to html', 'markdown', 'html', 'gfm', 'render markdown',
    'readme to html', 'convert markdown', 'markdown a html', 'export html', 'anchor links',
  ],
  accepts: { extensions: ['md', 'markdown', 'mdown', 'mkd'], kinds: ['text'] },
  produces: ['html'],
  quickLabel: 'Convert this Markdown to HTML',
  load: () => import('./ui'),
});
