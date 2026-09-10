import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/json-csv',
  name: 'JSON ↔ CSV',
  description: 'Convert JSON records to CSV and CSV rows back to JSON',
  category: 'developer',
  icon: 'Table2',
  weight: 80,
  standalone: true,
  keywords: [
    'json to csv', 'csv to json', 'csv', 'tsv', 'spreadsheet', 'excel', 'export data',
    'flatten json', 'array of objects', 'delimiter', 'convertir csv', 'json a csv',
  ],
  // No `accepts`: the two-pane UI takes text, and a file dropped on Home cannot
  // be handed over to it. Dropping a file straight onto the input pane works.
  produces: ['csv', 'json'],
  load: () => import('./ui'),
});
