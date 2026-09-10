import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'datetime/difference',
  name: 'Date Difference',
  description: 'Count years, days and working days between two dates',
  category: 'datetime',
  icon: 'CalendarRange',
  weight: 65,
  standalone: true,
  keywords: [
    'date difference',
    'days between dates',
    'how many days until',
    'age calculator',
    'business days',
    'working days',
    'date calculator',
    'weeks between',
    'countdown',
    'días entre fechas',
    'calcular edad',
    'diferencia de fechas',
  ],
  load: () => import('./ui'),
});
