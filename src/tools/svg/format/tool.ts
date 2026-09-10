import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'svg/format',
  name: 'SVG Formatter',
  description: 'Pretty-print SVG markup with the indent you prefer',
  category: 'svg',
  icon: 'AlignLeft',
  weight: 45,
  standalone: true,
  keywords: [
    'format svg', 'pretty print svg', 'beautify svg', 'indent svg', 'svg xml formatter',
    'readable svg', 'tidy svg', 'formatear svg', 'xml indent',
  ],
  accepts: { extensions: ['svg'], kinds: ['svg'], multiple: false },
  produces: ['svg'],
  quickLabel: 'Format this SVG',
  load: () => import('./ui'),
});
