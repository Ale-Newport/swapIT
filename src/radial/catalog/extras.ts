import { copyText } from '../system';
import type { RadialItem } from '../model';
import { ui } from './util';
import type { CatalogInput } from './util';

/**
 * Search-only extras. Finder already does the everyday things (open, Quick Look, move,
 * duplicate, compress, rename, Trash) from the right-click menu, so the ring does not offer
 * them. The one thing Finder hides — the path as text — is here for whoever types "path".
 */
export function extraItems(input: CatalogInput): RadialItem[] {
  if (input.files.length === 0) return [];
  return [
    ui({
      id: 'extra:copy-path',
      label: 'Copy path',
      title: 'Copy the full path as text',
      hint: input.files.length > 1 ? 'One path per line' : input.files[0].path,
      icon: 'Link',
      keywords: ['path', 'location', 'ruta', 'copiar ruta'],
      run: async (ctx) => {
        await copyText(ctx.paths.join('\n'));
        ctx.close();
      },
    }),
  ];
}
