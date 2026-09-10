import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/remove-metadata',
  name: 'Remove PDF Metadata',
  description: 'Strip author, title, dates and software traces from PDFs',
  category: 'pdf',
  icon: 'ShieldOff',
  weight: 44,
  keywords: [
    'remove pdf metadata', 'strip metadata', 'anonymize pdf', 'privacy', 'clean pdf',
    'remove author', 'sanitize', 'scrub pdf', 'quitar metadatos', 'anonimizar pdf', 'xmp',
  ],
  accepts: { kinds: ['pdf'], extensions: ['pdf'] },
  produces: ['pdf'],
  quickLabel: 'Strip PDF metadata',
  load: () => import('./ui'),
});
