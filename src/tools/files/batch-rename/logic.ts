/**
 * Rename rules mirror `RenameRule` in `src-tauri/src/cmd/files.rs`: an enum
 * tagged with `type` and declared `#[serde(rename_all = "camelCase")]`, which
 * for an enum renames the *variants* — so `RenameRule::ChangeExtension` is
 * `{ "type": "changeExtension" }` on the wire, not `"ChangeExtension"`. The
 * fields inside each variant keep their own names. These objects are sent to
 * `preview_rename` and `batch_rename` exactly as they are.
 */
export type RenameRule =
  | { type: 'prefix'; text: string }
  | { type: 'suffix'; text: string }
  | { type: 'replace'; find: string; replace: string; all: boolean }
  | { type: 'regex'; pattern: string; replace: string }
  | { type: 'sequence'; start: number; padding: number; separator: string; position: 'prefix' | 'suffix' }
  | { type: 'case'; mode: 'lower' | 'upper' | 'title' }
  | { type: 'slugify' }
  | { type: 'removeChars'; chars: string }
  | { type: 'changeExtension'; ext: string }
  | { type: 'transliterate' };

export type RuleType = RenameRule['type'];

/** A rule plus a stable key, so reordering never remounts the wrong editor. */
export interface KeyedRule {
  key: string;
  rule: RenameRule;
}

/** One row of `preview_rename`. */
export interface RenamePreview {
  path: string;
  from: string;
  to: string;
  conflict: boolean;
}

export const RULE_ORDER: RuleType[] = [
  'prefix',
  'suffix',
  'replace',
  'regex',
  'sequence',
  'case',
  'removeChars',
  'slugify',
  'transliterate',
  'changeExtension',
];

export const RULE_LABELS: Record<RuleType, string> = {
  prefix: 'Add a prefix',
  suffix: 'Add a suffix',
  replace: 'Find and replace',
  regex: 'Regular expression',
  sequence: 'Numbering',
  case: 'Change case',
  removeChars: 'Remove characters',
  slugify: 'Web-safe slug',
  transliterate: 'Remove accents',
  changeExtension: 'Change extension',
};

export function defaultRule(type: RuleType): RenameRule {
  switch (type) {
    case 'prefix':
      return { type: 'prefix', text: '' };
    case 'suffix':
      return { type: 'suffix', text: '' };
    case 'replace':
      return { type: 'replace', find: '', replace: '', all: true };
    case 'regex':
      return { type: 'regex', pattern: '', replace: '' };
    case 'sequence':
      return { type: 'sequence', start: 1, padding: 3, separator: '_', position: 'suffix' };
    case 'case':
      return { type: 'case', mode: 'lower' };
    case 'removeChars':
      return { type: 'removeChars', chars: '' };
    case 'changeExtension':
      return { type: 'changeExtension', ext: '' };
    case 'slugify':
      return { type: 'slugify' };
    case 'transliterate':
      return { type: 'transliterate' };
  }
}

/**
 * A rule with nothing filled in yet is a no-op. Those are kept in the list (the
 * user is still typing) but never sent, so the preview stays meaningful.
 */
export function isEffective(rule: RenameRule): boolean {
  switch (rule.type) {
    case 'prefix':
    case 'suffix':
      return rule.text.length > 0;
    case 'replace':
      return rule.find.length > 0;
    case 'regex':
      return rule.pattern.length > 0;
    case 'removeChars':
      return rule.chars.length > 0;
    case 'changeExtension':
      return rule.ext.trim().length > 0;
    default:
      return true;
  }
}

const CASE_LABELS: Record<'lower' | 'upper' | 'title', string> = {
  lower: 'lower case',
  upper: 'UPPER CASE',
  title: 'Title Case',
};

/** One line describing what a rule does, shown in the rule row header. */
export function describeRule(rule: RenameRule): string {
  switch (rule.type) {
    case 'prefix':
      return rule.text ? `Put “${rule.text}” in front` : 'Type the text to put in front';
    case 'suffix':
      return rule.text ? `Add “${rule.text}” at the end` : 'Type the text to add at the end';
    case 'replace':
      return rule.find
        ? `Replace ${rule.all ? 'every' : 'the first'} “${rule.find}” with “${rule.replace}”`
        : 'Type the text to look for';
    case 'regex':
      return rule.pattern ? `/${rule.pattern}/ → “${rule.replace}”` : 'Type a pattern to match';
    case 'sequence': {
      const example = String(rule.start).padStart(rule.padding, '0');
      return rule.position === 'prefix'
        ? `Number from ${example}${rule.separator} at the front`
        : `Number from ${rule.separator}${example} at the end`;
    }
    case 'case':
      return `Convert the name to ${CASE_LABELS[rule.mode]}`;
    case 'removeChars':
      return rule.chars ? `Delete any of “${rule.chars}”` : 'Type the characters to delete';
    case 'slugify':
      return 'Lower case, accents folded, spaces become hyphens';
    case 'transliterate':
      return 'Café → Cafe, mañana → manana';
    case 'changeExtension':
      return rule.ext.trim() ? `Extension becomes .${normalizeExtension(rule.ext)}` : 'Type the new extension';
  }
}

/** ".JPG" / "jpg " → "jpg" — the backend also trims the dot, this keeps the UI honest. */
export function normalizeExtension(raw: string): string {
  return raw.trim().replace(/^\.+/, '').toLowerCase();
}

/**
 * The rules actually worth sending to the backend, normalised so that what the
 * rule row promises is exactly what `preview_rename` and `batch_rename` do:
 * Rust only strips a leading dot, so ".JPG " has to be folded here or the
 * description ("Extension becomes .jpg") would contradict the new names.
 */
export function activeRules(rules: KeyedRule[]): RenameRule[] {
  return rules
    .filter((r) => isEffective(r.rule))
    .map((r) =>
      r.rule.type === 'changeExtension' ? { ...r.rule, ext: normalizeExtension(r.rule.ext) } : r.rule,
    );
}

export function countConflicts(previews: RenamePreview[]): number {
  return previews.filter((p) => p.conflict).length;
}

export function countChanged(previews: RenamePreview[]): number {
  return previews.filter((p) => p.from !== p.to).length;
}

/** Move a rule one slot up or down; out-of-range moves are ignored. */
export function moveRule(rules: KeyedRule[], index: number, delta: number): KeyedRule[] {
  const target = index + delta;
  if (index < 0 || index >= rules.length || target < 0 || target >= rules.length) return rules;
  const next = [...rules];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

export function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `rule-${Math.random().toString(36).slice(2)}`;
}

export function keyed(rule: RenameRule): KeyedRule {
  return { key: newKey(), rule };
}

export interface RulePreset {
  label: string;
  hint: string;
  /**
   * Built when the preset is clicked, never at module load: the date preset has
   * to read the clock at that moment, or a window left open past midnight would
   * still insert yesterday's stamp.
   */
  rules: () => RenameRule[];
}

/** YYYY-MM-DD in local time — file names are sorted by humans, not by UTC. */
export function todayStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Starting points that cover the renames people actually ask for. */
export const PRESETS: RulePreset[] = [
  {
    label: 'Number them',
    hint: 'photo.jpg → photo_001.jpg',
    rules: () => [{ type: 'sequence', start: 1, padding: 3, separator: '_', position: 'suffix' }],
  },
  {
    label: 'Web-safe names',
    hint: 'Mi Foto (1).JPG → mi-foto-1.jpg',
    rules: () => [{ type: 'slugify' }, { type: 'case', mode: 'lower' }],
  },
  {
    label: 'Date prefix',
    hint: 'Adds today’s date in front',
    rules: () => [{ type: 'prefix', text: `${todayStamp()}-` }],
  },
  {
    label: 'Clean up spaces',
    hint: 'my file.txt → my_file.txt',
    rules: () => [{ type: 'replace', find: ' ', replace: '_', all: true }],
  },
];
