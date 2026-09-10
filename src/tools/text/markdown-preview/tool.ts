import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/markdown-preview',
  name: 'Markdown Preview',
  description: 'Write Markdown and see it rendered as you type',
  category: 'text',
  icon: 'FileText',
  weight: 66,
  standalone: true,
  keywords: [
    'markdown', 'md', 'preview', 'render markdown', 'readme', 'gfm', 'live preview',
    'markdown viewer', 'vista previa', 'ver markdown', 'notes', 'tables',
  ],
  accepts: { extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'], kinds: ['text'] },
  quickLabel: 'Preview this Markdown',
  load: () => import('./ui'),
});
