import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'generators/uuid',
  name: 'UUID Generator',
  description: 'Make random v4 or time-ordered v7 identifiers',
  category: 'generators',
  icon: 'Fingerprint',
  weight: 85,
  standalone: true,
  keywords: [
    'uuid', 'guid', 'uuid generator', 'uuid v4', 'uuid v7', 'unique id', 'random id',
    'primary key', 'nil uuid', 'identifier', 'generar uuid', 'identificador único',
  ],
  produces: ['txt'],
  load: () => import('./ui'),
});
