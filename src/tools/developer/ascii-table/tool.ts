import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/ascii-table',
  name: 'ASCII Table',
  description: 'Every ASCII and Latin-1 code with hex, octal and entities',
  category: 'developer',
  icon: 'Table',
  weight: 35,
  standalone: true,
  keywords: [
    'ascii',
    'ascii table',
    'character codes',
    'latin-1',
    'html entity',
    'hex codes',
    'control characters',
    'charset',
    'tabla ascii',
    'codigos de caracteres',
  ],
  load: () => import('./ui'),
});
