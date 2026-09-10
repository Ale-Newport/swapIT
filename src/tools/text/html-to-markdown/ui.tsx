import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Field, Segmented } from '@/components/ui';
import { DEFAULT_HTML_OPTIONS, htmlToMarkdown, type HtmlToMarkdownOptions } from './logic';

const SAMPLE = `<article>
  <h1>Release notes</h1>
  <p>Toolbox <strong>0.1.0</strong> is out. It runs <em>entirely</em> on your Mac.</p>
  <ul>
    <li>Convert HEIC photos</li>
    <li>Compress PDFs</li>
  </ul>
  <table>
    <thead><tr><th>Tool</th><th>Category</th></tr></thead>
    <tbody><tr><td>Image Converter</td><td>Images</td></tr></tbody>
  </table>
  <pre><code>npm run tauri dev</code></pre>
  <p>More at <a href="https://example.com">the site</a>.</p>
</article>`;

export default function HtmlToMarkdown() {
  const [headingStyle, setHeadingStyle] = useState<HtmlToMarkdownOptions['headingStyle']>(
    DEFAULT_HTML_OPTIONS.headingStyle,
  );
  const [bullet, setBullet] = useState<HtmlToMarkdownOptions['bullet']>(DEFAULT_HTML_OPTIONS.bullet);
  const [codeBlockStyle, setCodeBlockStyle] = useState<HtmlToMarkdownOptions['codeBlockStyle']>(
    DEFAULT_HTML_OPTIONS.codeBlockStyle,
  );
  const [emphasis, setEmphasis] = useState<HtmlToMarkdownOptions['emphasis']>(DEFAULT_HTML_OPTIONS.emphasis);
  const [unknownTags, setUnknownTags] = useState<HtmlToMarkdownOptions['unknownTags']>(
    DEFAULT_HTML_OPTIONS.unknownTags,
  );

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const output = htmlToMarkdown(input, { headingStyle, bullet, codeBlockStyle, emphasis, unknownTags });
      return {
        output,
        stats: [
          { label: 'Lines', value: output ? output.split('\n').length.toLocaleString() : '0' },
          { label: 'Words', value: output.trim() ? output.trim().split(/\s+/).length.toLocaleString() : '0' },
          {
            label: 'Shrunk to',
            value: input.length ? `${Math.round((output.length / input.length) * 100)}%` : '—',
          },
        ],
      };
    },
    [headingStyle, bullet, codeBlockStyle, emphasis, unknownTags],
  );

  return (
    <TextTool
      transform={transform}
      saveExtension="md"
      inputLabel="HTML"
      outputLabel="Markdown"
      placeholder="<h1>Title</h1><p>Paste HTML here…</p>"
      sampleText={SAMPLE}
      minRows={16}
      options={
        <div className="flex flex-wrap items-end gap-5">
          <Field label="Headings">
            <Segmented
              value={headingStyle}
              onChange={setHeadingStyle}
              options={[
                { value: 'atx', label: '# Title' },
                { value: 'setext', label: 'Underlined' },
              ]}
            />
          </Field>
          <Field label="Bullets">
            <Segmented
              value={bullet}
              onChange={setBullet}
              options={[
                { value: '-', label: '-' },
                { value: '*', label: '*' },
                { value: '+', label: '+' },
              ]}
            />
          </Field>
          <Field label="Code blocks">
            <Segmented
              value={codeBlockStyle}
              onChange={setCodeBlockStyle}
              options={[
                { value: 'fenced', label: 'Fenced' },
                { value: 'indented', label: 'Indented' },
              ]}
            />
          </Field>
          <Field label="Emphasis">
            <Segmented
              value={emphasis}
              onChange={setEmphasis}
              options={[
                { value: 'asterisk', label: '*a* **b**' },
                { value: 'underscore', label: '_a_ __b__' },
              ]}
            />
          </Field>
          <Field label="Tags Markdown cannot express" hint="Custom elements, video, forms and the like">
            <Segmented
              value={unknownTags}
              onChange={setUnknownTags}
              options={[
                { value: 'convert', label: 'Keep the text' },
                { value: 'keep', label: 'Keep as HTML' },
                { value: 'remove', label: 'Drop them' },
              ]}
            />
          </Field>
        </div>
      }
    />
  );
}
