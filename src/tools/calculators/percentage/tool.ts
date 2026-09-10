import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'calculators/percentage',
  name: 'Percentage Calculator',
  description: 'Percent of, change, increase, decrease and reverse',
  category: 'calculators',
  icon: 'Percent',
  weight: 60,
  standalone: true,
  keywords: [
    'percentage', 'percent', 'x percent of y', 'percentage increase', 'percentage decrease',
    'percent change', 'discount', 'markup', 'vat', 'tip', 'reverse percentage',
    'porcentaje', 'tanto por ciento',
  ],
  load: () => import('./ui'),
});
