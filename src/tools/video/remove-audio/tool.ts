import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/remove-audio',
  name: 'Remove Audio',
  description: 'Strip the sound from video without re-encoding the picture',
  category: 'video',
  icon: 'VolumeX',
  weight: 58,
  requires: ['ffmpeg'],
  keywords: [
    'remove audio', 'mute video', 'silence video', 'strip audio', 'no sound', 'delete audio track',
    'silent video', 'quitar audio', 'silenciar video', 'video sin sonido', 'mute', 'drop soundtrack',
  ],
  accepts: { kinds: ['video'], extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] },
  produces: ['mp4', 'mov', 'mkv', 'webm'],
  quickLabel: 'Remove the audio',
  load: () => import('./ui'),
});
