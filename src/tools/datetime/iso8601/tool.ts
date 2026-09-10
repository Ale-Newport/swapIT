import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'datetime/iso8601',
  name: 'ISO 8601 Converter',
  description: 'Read and write ISO dates, weeks, durations and intervals',
  category: 'datetime',
  icon: 'CalendarCheck',
  weight: 45,
  standalone: true,
  keywords: [
    'iso 8601',
    'iso date',
    'rfc 3339',
    'week date',
    'ordinal date',
    'iso duration',
    'p1y2m3d',
    'date format',
    'utc offset',
    'parse date string',
    'formato iso',
    'fecha iso 8601',
  ],
  load: () => import('./ui'),
});
