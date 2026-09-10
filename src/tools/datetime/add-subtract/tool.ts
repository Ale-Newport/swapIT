import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'datetime/add-subtract',
  name: 'Add or Subtract Time',
  description: 'Move a date forward or back by any amount of time',
  category: 'datetime',
  icon: 'CalendarPlus',
  weight: 55,
  standalone: true,
  keywords: [
    'add days to date',
    'subtract days',
    'date calculator',
    'deadline',
    'due date',
    'business days',
    '90 days from today',
    'add months',
    'date plus time',
    'sumar dias a una fecha',
    'restar fechas',
    'calcular vencimiento',
  ],
  load: () => import('./ui'),
});
