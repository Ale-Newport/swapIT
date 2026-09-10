import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/cron',
  name: 'Cron Expression Helper',
  description: 'Explain a cron schedule and preview its next runs',
  category: 'developer',
  icon: 'CalendarClock',
  weight: 60,
  standalone: true,
  keywords: [
    'cron',
    'crontab',
    'schedule',
    'cron expression',
    'next run',
    'every 5 minutes',
    'timer',
    'job scheduler',
    'expresion cron',
    'programar tarea',
  ],
  load: () => import('./ui'),
});
