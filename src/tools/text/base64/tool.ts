import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/base64',
  name: 'Base64 Encode / Decode',
  description: 'Convert text to base64 and back, UTF-8 safe',
  category: 'text',
  icon: 'Binary',
  weight: 72,
  standalone: true,
  keywords: [
    'base64',
    'base 64',
    'encode',
    'decode',
    'btoa',
    'atob',
    'data uri',
    'url safe base64',
    'base64 to file',
    'codificar base64',
    'decodificar base64',
  ],
  // No `accepts`, and therefore no `quickLabel`: the pane takes pasted text or a
  // text file dropped straight onto it, and `quickLabel` is only ever rendered
  // for tools that `registry.toolsForFile` returns — which skips a tool with no
  // `accepts`.
  load: () => import('./ui'),
});
