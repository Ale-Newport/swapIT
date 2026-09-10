import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/diff',
  name: 'Text Diff',
  description: 'Compare two texts and see exactly what changed',
  category: 'text',
  icon: 'GitCompare',
  weight: 75,
  standalone: true,
  keywords: [
    'diff', 'compare', 'text compare', 'difference', 'changes', 'patch', 'unified diff',
    'side by side', 'compare files', 'comparar textos', 'diferencias', 'before and after',
  ],
  accepts: { kinds: ['text', 'code', 'data'], extensions: ['txt', 'md', 'json', 'csv', 'log', 'xml', 'yml', 'yaml', 'html', 'css', 'js', 'ts'] },
  quickLabel: 'Compare with another text',
  load: () => import('./ui'),
});
