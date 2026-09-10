import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'calculators/dpi',
  name: 'DPI / PPI Calculator',
  description: 'Pixels to print size at any DPI, plus screen PPI',
  category: 'calculators',
  icon: 'ScanLine',
  weight: 45,
  standalone: true,
  keywords: [
    'dpi', 'ppi', 'print size', 'pixels per inch', 'dots per inch', '300 dpi', '72 dpi',
    'print resolution', 'poster size', 'screen ppi', 'pixel density', 'resolucion de impresion',
    'puntos por pulgada',
  ],
  load: () => import('./ui'),
});
