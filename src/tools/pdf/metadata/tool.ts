import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/metadata',
  name: 'PDF Metadata',
  description: 'Inspect and edit PDF title, author, subject and keywords',
  category: 'pdf',
  icon: 'Info',
  weight: 45,
  requires: ['pdftotext'],
  keywords: [
    'pdf metadata', 'document properties', 'pdf info', 'title', 'author', 'subject', 'keywords',
    'producer', 'page count', 'edit pdf properties', 'metadatos pdf', 'propiedades del documento',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['pdf'],
  quickLabel: 'Inspect PDF properties',
  load: () => import('./ui'),
});
