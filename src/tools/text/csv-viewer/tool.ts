import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/csv-viewer',
  name: 'CSV Viewer',
  description: 'Open, sort, filter and convert CSV and TSV files',
  category: 'text',
  icon: 'Table',
  weight: 62,
  standalone: true,
  keywords: [
    'csv', 'tsv', 'spreadsheet', 'table', 'view csv', 'open csv', 'csv to json', 'delimiter',
    'sort columns', 'filter rows', 'ver csv', 'tabla', 'comma separated',
  ],
  // Extensions only: the pane loads delimited text, so claiming the whole
  // `data` kind would offer "View this CSV" for JSON, YAML, XML and plists and
  // then refuse them.
  accepts: { extensions: ['csv', 'tsv'], multiple: false },
  produces: ['csv', 'tsv', 'json'],
  quickLabel: 'View this CSV',
  load: () => import('./ui'),
});
