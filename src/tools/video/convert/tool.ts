import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/convert',
  name: 'Video Converter',
  description: 'Convert video to MP4, MOV, MKV, WebM or AVI',
  category: 'video',
  icon: 'FileVideo',
  weight: 100,
  requires: ['ffmpeg'],
  keywords: [
    'mov to mp4', 'convert video', 'video format', 'mp4', 'mkv', 'webm', 'avi',
    'h264', 'h265', 'hevc', 'vp9', 'prores', 'convertir video', 'cambiar formato video',
  ],
  accepts: {
    kinds: ['video'],
    extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'ogv', 'mts', 'm2ts'],
  },
  produces: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'],
  quickLabel: 'Convert this video',
  load: () => import('./ui'),
});
