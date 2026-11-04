import { describe, expect, it } from 'vitest';
import type { RadialItem } from './model';
import { flattenItems, searchItems, trail, visibleItems } from './menu';

function item(id: string, label: string, extra: Partial<RadialItem> = {}): RadialItem {
  return { id, label, title: label, icon: 'Box', mode: 'task', run: async () => undefined, ...extra };
}

const resize = item('menu:resize', 'Resize', {
  mode: 'ui',
  children: [item('edit:resize-50', 'Half size', { keywords: ['smaller', 'resize'] }), item('edit:resize-25', 'Quarter size')],
});
const root = [item('convert:jpg', 'JPEG', { glyph: 'JPG', keywords: ['jpg', 'to jpg'] }), item('edit:compress', 'Compress', { keywords: ['reduce size', 'smaller'] }), resize];
const pool = flattenItems(root);

describe('visibleItems', () => {
  it('shows the first ring until a menu is opened', () => {
    expect(visibleItems(root, [], null)).toBe(root);
    expect(visibleItems(root, [resize], null)).toBe(resize.children);
  });

  it('prefers search results over everything', () => {
    const results = [item('x', 'x')];
    expect(visibleItems(root, [resize], results)).toBe(results);
  });
});

describe('flattenItems', () => {
  it('reaches into menus and drops duplicates', () => {
    const flat = flattenItems([...root, item('edit:compress', 'Compress again')]);
    expect(flat.map((i) => i.id)).toEqual(['convert:jpg', 'edit:compress', 'menu:resize', 'edit:resize-50', 'edit:resize-25']);
  });
});

describe('searchItems', () => {
  it('finds by label, glyph, keyword and synonym', () => {
    expect(searchItems(pool, 'compress')[0]?.id).toBe('edit:compress');
    expect(searchItems(pool, 'jpg')[0]?.id).toBe('convert:jpg');
    expect(searchItems(pool, 'reduce')[0]?.id).toBe('edit:compress');
  });

  it('finds an action that lives inside a menu, but not the menu itself', () => {
    const ids = searchItems(pool, 'half').map((i) => i.id);
    expect(ids).toContain('edit:resize-50');
    expect(searchItems(pool, 'resize').map((i) => i.id)).not.toContain('menu:resize');
  });

  it('never returns more than a ring can show', () => {
    const many = Array.from({ length: 30 }, (_, i) => item(`n${i}`, `note ${i}`));
    expect(searchItems(many, 'note').length).toBeLessThanOrEqual(6);
  });

  it('returns nothing for an empty query and nothing for nonsense', () => {
    expect(searchItems(pool, '   ')).toEqual([]);
    expect(searchItems(pool, 'zzzzqqq')).toEqual([]);
  });
});

describe('trail', () => {
  it('joins the open menus', () => {
    expect(trail([])).toBe('');
    expect(trail([resize])).toBe('Resize');
  });
});
