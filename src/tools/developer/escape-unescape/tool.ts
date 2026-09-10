import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/escape-unescape',
  name: 'String Escape',
  description: 'Escape or unescape text for JSON, JS, SQL, shell, CSV and XML',
  category: 'developer',
  icon: 'Quote',
  weight: 50,
  standalone: true,
  keywords: [
    'escape', 'unescape', 'json string', 'javascript string', 'sql quotes', 'shell quoting',
    'csv field', 'regex escape', 'html entities', 'xml attribute', 'escapar texto', 'comillas',
  ],
  // No `quickLabel`: the tool takes typed or pasted text and declares no
  // `accepts`, so it never appears in the drop-zone quick actions that render it.
  load: () => import('./ui'),
});
