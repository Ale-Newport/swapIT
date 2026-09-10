import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'clipboard/clean-formatting',
  name: 'Paste Without Formatting',
  description: 'Strip smart quotes, odd spaces and stray line breaks',
  category: 'clipboard',
  icon: 'ClipboardPaste',
  weight: 50,
  standalone: true,
  keywords: [
    'paste without formatting', 'plain text', 'clean text', 'smart quotes', 'curly quotes',
    'non-breaking space', 'zero width', 'remove line breaks', 'unwrap text', 'strip formatting',
    'pegar sin formato', 'texto plano', 'limpiar texto',
  ],
  load: () => import('./ui'),
});
