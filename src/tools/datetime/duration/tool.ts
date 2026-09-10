import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'datetime/duration',
  name: 'Human Readable Duration',
  description: 'Turn seconds into words and read durations back',
  category: 'datetime',
  icon: 'Timer',
  weight: 50,
  standalone: true,
  keywords: [
    'duration',
    'seconds to minutes',
    'seconds to hours',
    'convert seconds',
    'hh:mm:ss',
    'timecode',
    'milliseconds to time',
    'uptime',
    'how long is',
    'convertir segundos',
    'duracion legible',
    'tiempo transcurrido',
  ],
  load: () => import('./ui'),
});
