import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/speed',
  name: 'Change Video Speed',
  description: 'Speed up or slow down video while keeping audio pitch',
  category: 'video',
  icon: 'FastForward',
  weight: 64,
  requires: ['ffmpeg'],
  keywords: [
    'speed', 'video speed', 'speed up video', 'slow down video', 'slow motion', 'fast forward',
    'timelapse', 'time lapse', '2x', 'tempo', 'acelerar video', 'camara lenta', 'velocidad',
  ],
  accepts: { kinds: ['video'], extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] },
  produces: ['mp4', 'mov', 'mkv', 'webm'],
  quickLabel: 'Change the speed',
  load: () => import('./ui'),
});
