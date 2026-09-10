import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'generators/fake-data',
  name: 'Fake Test Data',
  description: 'Fictional people for testing, as JSON, CSV or SQL',
  category: 'generators',
  icon: 'UserRoundPlus',
  weight: 48,
  standalone: true,
  keywords: [
    'fake data', 'test data', 'dummy data', 'sample data', 'mock data', 'seed database',
    'fake names', 'fake addresses', 'csv sample', 'sql insert', 'datos de prueba',
    'datos falsos', 'generador de datos',
  ],
  produces: ['json', 'csv', 'sql'],
  load: () => import('./ui'),
});
