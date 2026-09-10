import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/to-text',
  name: 'PDF to Text',
  description: 'Pull the words out of a PDF as plain text',
  category: 'pdf',
  icon: 'FileType',
  weight: 85,
  requires: ['pdftotext'],
  keywords: [
    'pdf to text',
    'pdf to txt',
    'extract text from pdf',
    'copy text from pdf',
    'read pdf text',
    'plain text',
    'transcribe pdf',
    'pdf content',
    'pdf a texto',
    'extraer texto de pdf',
    'texto plano',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['txt'],
  quickLabel: 'Extract the text',
  load: () => import('./ui'),
});
