import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'datetime/timezone',
  name: 'Timezone Converter',
  description: 'Compare one moment across cities and plan meetings',
  category: 'datetime',
  icon: 'Globe',
  weight: 70,
  standalone: true,
  keywords: [
    'timezone',
    'time zone converter',
    'world clock',
    'meeting planner',
    'utc offset',
    'daylight saving',
    'dst',
    'what time is it in',
    'schedule across time zones',
    'convertir zona horaria',
    'hora en otro pais',
    'husos horarios',
  ],
  load: () => import('./ui'),
});
