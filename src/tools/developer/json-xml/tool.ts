import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/json-xml',
  name: 'JSON ↔ XML',
  description: 'Convert JSON to XML and XML documents back to JSON',
  category: 'developer',
  icon: 'FileCode2',
  weight: 70,
  standalone: true,
  keywords: [
    'json to xml', 'xml to json', 'xml', 'soap', 'rss', 'plist', 'attributes',
    'parse xml', 'convert xml', 'convertir xml', 'json a xml',
  ],
  // No `accepts`: the two-pane UI takes text, and a file dropped on Home cannot
  // be handed over to it. Dropping a file straight onto the input pane works.
  produces: ['xml', 'json'],
  load: () => import('./ui'),
});
