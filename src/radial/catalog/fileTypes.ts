/** The kinds of file the "New file" card can make, with a sensible starting point for each. */

export interface TemplateContext {
  title: string;
  date: Date;
}

export interface NewFileType {
  id: string;
  label: string;
  ext: string;
  glyph: string;
  icon: string;
  placeholder: string;
  executable?: boolean;
  template: (ctx: TemplateContext) => string;
  /** Extra starting points, shown as a menu inside the card. */
  variants?: Array<{ id: string; label: string; template: (ctx: TemplateContext) => string }>;
}

const longDate = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const shortDate = (d: Date) => d.toISOString().slice(0, 10);

export const MARKDOWN_VARIANTS: NonNullable<NewFileType['variants']> = [
  { id: 'blank', label: 'Blank', template: ({ title }) => (title ? `# ${title}\n\n` : '') },
  {
    id: 'meeting',
    label: 'Meeting notes',
    template: ({ title, date }) =>
      `# ${title || 'Meeting'}\n\n**Date:** ${longDate(date)}  \n**Attendees:** \n\n## Agenda\n\n- \n\n## Notes\n\n\n## Action items\n\n- [ ] \n`,
  },
  {
    id: 'daily',
    label: 'Daily note',
    template: ({ date }) => `# ${longDate(date)}\n\n## Today\n\n- [ ] \n\n## Notes\n\n\n## Gratitude\n\n- \n`,
  },
  { id: 'todo', label: 'To-do list', template: ({ title }) => `# ${title || 'To do'}\n\n- [ ] \n- [ ] \n- [ ] \n` },
  {
    id: 'readme',
    label: 'README',
    template: ({ title }) =>
      `# ${title || 'Project'}\n\nOne sentence on what this is.\n\n## Install\n\n\`\`\`bash\n\n\`\`\`\n\n## Usage\n\n\n## License\n\nMIT\n`,
  },
  {
    id: 'post',
    label: 'Blog post',
    template: ({ title, date }) => `---\ntitle: ${title || 'Untitled'}\ndate: ${shortDate(date)}\ndraft: true\n---\n\n`,
  },
];

export const FILE_TYPES: NewFileType[] = [
  {
    id: 'txt',
    label: 'Text',
    ext: 'txt',
    glyph: 'TXT',
    icon: 'FileText',
    placeholder: 'Start typing…',
    template: () => '',
  },
  {
    id: 'md',
    label: 'Markdown',
    ext: 'md',
    glyph: 'MD',
    icon: 'FileCode2',
    placeholder: '# A title, then your notes…',
    template: ({ title }) => (title ? `# ${title}\n\n` : ''),
    variants: MARKDOWN_VARIANTS,
  },
  {
    id: 'json',
    label: 'JSON',
    ext: 'json',
    glyph: 'JSON',
    icon: 'Braces',
    placeholder: '{ }',
    template: () => '{\n  \n}\n',
  },
  {
    id: 'html',
    label: 'HTML',
    ext: 'html',
    glyph: 'HTML',
    icon: 'Globe',
    placeholder: '<!doctype html>',
    template: ({ title }) =>
      `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${title || 'Untitled'}</title>\n</head>\n<body>\n  \n</body>\n</html>\n`,
  },
  {
    id: 'css',
    label: 'CSS',
    ext: 'css',
    glyph: 'CSS',
    icon: 'Palette',
    placeholder: 'body { }',
    template: () => ':root {\n  \n}\n\nbody {\n  margin: 0;\n}\n',
  },
  {
    id: 'js',
    label: 'JavaScript',
    ext: 'js',
    glyph: 'JS',
    icon: 'FileCode2',
    placeholder: "console.log('hello');",
    template: () => "'use strict';\n\n",
  },
  {
    id: 'ts',
    label: 'TypeScript',
    ext: 'ts',
    glyph: 'TS',
    icon: 'FileCode2',
    placeholder: 'export {};',
    template: () => 'export {};\n',
  },
  {
    id: 'py',
    label: 'Python',
    ext: 'py',
    glyph: 'PY',
    icon: 'FileCode2',
    placeholder: 'print("hello")',
    template: () => '#!/usr/bin/env python3\n\n\ndef main() -> None:\n    pass\n\n\nif __name__ == "__main__":\n    main()\n',
  },
  {
    id: 'sh',
    label: 'Shell script',
    ext: 'sh',
    glyph: 'SH',
    icon: 'Terminal',
    placeholder: 'echo hello',
    executable: true,
    template: () => '#!/usr/bin/env bash\nset -euo pipefail\n\n',
  },
  {
    id: 'csv',
    label: 'CSV',
    ext: 'csv',
    glyph: 'CSV',
    icon: 'Table',
    placeholder: 'name,value',
    template: () => 'name,value\n',
  },
  {
    id: 'yaml',
    label: 'YAML',
    ext: 'yaml',
    glyph: 'YAML',
    icon: 'FileCode2',
    placeholder: 'key: value',
    template: () => '',
  },
  {
    id: 'xml',
    label: 'XML',
    ext: 'xml',
    glyph: 'XML',
    icon: 'CodeXml',
    placeholder: '<root />',
    template: () => '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  \n</root>\n',
  },
  {
    id: 'svg',
    label: 'SVG',
    ext: 'svg',
    glyph: 'SVG',
    icon: 'PenTool',
    placeholder: '<svg …>',
    template: () =>
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">\n  <circle cx="50" cy="50" r="40" fill="#0a84ff"/>\n</svg>\n',
  },
  {
    id: 'swift',
    label: 'Swift',
    ext: 'swift',
    glyph: 'SWIFT',
    icon: 'FileCode2',
    placeholder: 'import Foundation',
    template: () => 'import Foundation\n\n',
  },
];

export function fileType(id: string): NewFileType {
  return FILE_TYPES.find((t) => t.id === id) ?? FILE_TYPES[0];
}

/** `# Meeting with Ana` → `Meeting with Ana`, for naming a note after what it says. */
export function titleFromContent(content: string): string {
  const line = content
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return '';
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*>\s[\]x]+/i, '')
    .replace(/[`*_~]/g, '')
    .replace(/[/\\:*?"<>|]/g, '')
    .trim()
    .slice(0, 60)
    .trim();
}
