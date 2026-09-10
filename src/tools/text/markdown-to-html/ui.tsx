import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { formatBytes } from '@/core/format';
import { Field, Switch } from '@/components/ui';
import { DEFAULT_MD_OPTIONS, documentTitle, markdownToHtml } from './logic';

const SAMPLE = `# Release notes

Toolbox **0.1.0** runs entirely on your Mac.

## What is new

- Convert HEIC photos to JPG
- Compress PDFs ~~and Word files~~
- [Read the docs](https://example.com)

| Tool | Category |
| --- | --- |
| Image Converter | Images |
| CSV Viewer | Text |

\`\`\`bash
npm run tauri dev
\`\`\`
`;

export default function MarkdownToHtml() {
  const [gfm, setGfm] = useState(DEFAULT_MD_OPTIONS.gfm);
  const [breaks, setBreaks] = useState(DEFAULT_MD_OPTIONS.breaks);
  const [headerIds, setHeaderIds] = useState(DEFAULT_MD_OPTIONS.headerIds);
  const [fullDocument, setFullDocument] = useState(DEFAULT_MD_OPTIONS.fullDocument);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const output = markdownToHtml(input, { gfm, breaks, headerIds, fullDocument });
      const stats = [
        { label: 'Size', value: formatBytes(new TextEncoder().encode(output).byteLength) },
        { label: 'Lines', value: output ? output.split('\n').length.toLocaleString() : '0' },
      ];
      if (fullDocument && input.trim()) stats.push({ label: 'Title', value: documentTitle(input) });
      return { output, stats };
    },
    [gfm, breaks, headerIds, fullDocument],
  );

  return (
    <TextTool
      transform={transform}
      saveExtension="html"
      inputLabel="Markdown"
      outputLabel="HTML"
      placeholder={'# Heading\n\nWrite Markdown here…'}
      sampleText={SAMPLE}
      minRows={16}
      options={
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <Field inline label="GitHub flavour" hint="Tables, task lists, strikethrough, autolinks">
            <Switch checked={gfm} onCheckedChange={setGfm} />
          </Field>
          <Field inline label="Line breaks" hint="A single newline becomes a <br>">
            <Switch checked={breaks} onCheckedChange={setBreaks} />
          </Field>
          <Field inline label="Heading ids" hint="Adds anchors such as id=&quot;getting-started&quot;">
            <Switch checked={headerIds} onCheckedChange={setHeaderIds} />
          </Field>
          <Field inline label="Full document" hint="Wrap in an HTML5 page with a readable stylesheet">
            <Switch checked={fullDocument} onCheckedChange={setFullDocument} />
          </Field>
        </div>
      }
    />
  );
}
