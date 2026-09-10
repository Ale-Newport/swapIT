import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/trim',
  name: 'Trim Video',
  description: 'Cut a clip out of a video, with or without re-encoding',
  category: 'video',
  icon: 'Scissors',
  weight: 90,
  // FFprobe is not optional here: the timeline, the time fields and the Trim
  // button all wait on the duration `probe_media` reports, so without it the
  // tool has nothing to work with and the install card is the honest answer.
  requires: ['ffmpeg', 'ffprobe'],
  keywords: [
    'trim video', 'cut video', 'clip', 'shorten video', 'remove beginning',
    'start and end', 'timeline', 'crop time', 'recortar video', 'cortar video',
    'split video', 'extract clip',
  ],
  accepts: {
    kinds: ['video'],
    extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'mts', 'm2ts'],
    multiple: false,
  },
  produces: ['mp4', 'mov', 'mkv', 'webm'],
  quickLabel: 'Trim this video',
  load: () => import('./ui'),
});
