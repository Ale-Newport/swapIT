import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'clipboard/to-file',
  name: 'Clipboard to File',
  description: 'Save what you copied as a text, JSON, CSV or HTML file',
  category: 'clipboard',
  icon: 'FileDown',
  weight: 45,
  standalone: true,
  keywords: [
    'clipboard to file', 'save clipboard', 'paste to file', 'copy to txt', 'save as json',
    'save as csv', 'save as markdown', 'clipboard to html', 'guardar portapapeles',
    'pegar en archivo', 'portapapeles a archivo',
  ],
  produces: ['txt', 'md', 'json', 'csv', 'html'],
  load: () => import('./ui'),
});
