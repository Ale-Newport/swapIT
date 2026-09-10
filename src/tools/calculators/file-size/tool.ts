import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'calculators/file-size',
  name: 'File Size Converter',
  description: 'Convert bytes, KB, MB, GB and KiB, MiB, GiB',
  category: 'calculators',
  icon: 'HardDrive',
  weight: 40,
  standalone: true,
  keywords: [
    'file size', 'bytes', 'kb to mb', 'mb to gb', 'gb to tb', 'kib', 'mib', 'gib',
    '1024 vs 1000', 'binary units', 'megabytes', 'gigabytes', 'convertir bytes', 'tamano de archivo',
  ],
  load: () => import('./ui'),
});
