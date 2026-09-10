import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'text/xml-formatter',
  name: 'XML Formatter',
  description: 'Pretty-print, minify and check XML',
  category: 'text',
  icon: 'Code2',
  weight: 60,
  standalone: true,
  keywords: [
    'xml', 'format xml', 'pretty print', 'beautify', 'minify', 'indent', 'validate xml',
    'rss', 'svg source', 'plist', 'formatear xml', 'sitemap',
  ],
  accepts: { extensions: ['xml', 'rss', 'atom', 'plist', 'xsd', 'xsl', 'svg'], kinds: ['data', 'code'] },
  quickLabel: 'Format this XML',
  load: () => import('./ui'),
});
