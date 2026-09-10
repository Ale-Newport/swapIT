import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/word-to-pdf',
  name: 'Word to PDF',
  description: 'Turn Word, Excel, PowerPoint and text files into PDFs',
  category: 'pdf',
  icon: 'FileOutput',
  weight: 68,
  requires: ['soffice'],
  keywords: [
    'word to pdf',
    'docx to pdf',
    'doc to pdf',
    'excel to pdf',
    'xlsx to pdf',
    'powerpoint to pdf',
    'pptx to pdf',
    'txt to pdf',
    'rtf to pdf',
    'odt to pdf',
    'export as pdf',
    'word a pdf',
    'convertir a pdf',
  ],
  // Extensions only: the `document` kind also covers .pages and .epub, which
  // LibreOffice does not take here, and the UI filters on these extensions —
  // so naming the kind would offer the tool for files it then refuses.
  accepts: {
    extensions: ['doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp'],
  },
  produces: ['pdf'],
  quickLabel: 'Convert to PDF',
  load: () => import('./ui'),
});
