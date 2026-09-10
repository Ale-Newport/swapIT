import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'datetime/timestamp',
  name: 'Unix Timestamp Converter',
  description: 'Turn epoch numbers into dates and back, live',
  category: 'datetime',
  icon: 'Clock',
  weight: 85,
  standalone: true,
  keywords: [
    'unix timestamp',
    'epoch',
    'epoch converter',
    'timestamp to date',
    'date to timestamp',
    'milliseconds',
    'current timestamp',
    'time_t',
    '2038',
    'iso 8601',
    'marca de tiempo',
    'convertir epoch',
  ],
  load: () => import('./ui'),
});
