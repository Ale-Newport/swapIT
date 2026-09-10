import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/to-word',
  name: 'PDF to Word',
  description: 'Convert PDFs into editable Word, ODT or RTF documents',
  category: 'pdf',
  icon: 'FileText',
  weight: 70,
  requires: ['soffice'],
  keywords: [
    'pdf to word',
    'pdf to docx',
    'pdf to doc',
    'edit a pdf',
    'pdf to rtf',
    'pdf to odt',
    'make pdf editable',
    'libreoffice',
    'pdf a word',
    'convertir pdf a docx',
    'editar pdf',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['docx', 'odt', 'rtf'],
  quickLabel: 'Convert to Word',
  load: () => import('./ui'),
});
