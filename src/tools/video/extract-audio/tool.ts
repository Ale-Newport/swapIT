import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/extract-audio',
  name: 'Extract Audio',
  description: 'Pull the audio track out of any video as MP3, WAV, AAC or FLAC',
  category: 'video',
  icon: 'AudioLines',
  weight: 95,
  requires: ['ffmpeg'],
  keywords: ['mp4 to mp3', 'video to mp3', 'extract audio', 'rip audio', 'video to wav', 'soundtrack', 'audio from video'],
  accepts: { kinds: ['video'] },
  // Exactly the FORMATS the panel offers — the search index is built from this.
  produces: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus'],
  quickLabel: 'Extract the audio',
  load: () => import('./ui'),
});
