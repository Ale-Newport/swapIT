import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/base-converter',
  name: 'Number Base Converter',
  description: 'Convert between binary, octal, decimal, hex and any base',
  category: 'developer',
  icon: 'Binary',
  weight: 58,
  standalone: true,
  keywords: [
    'base converter',
    'binary to decimal',
    'decimal to hex',
    'hexadecimal',
    'octal',
    'radix',
    'bits',
    'bigint',
    'convertir binario a decimal',
    'base numerica',
  ],
  load: () => import('./ui'),
});
