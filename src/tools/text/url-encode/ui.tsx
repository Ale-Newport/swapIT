import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Checkbox, Field, Segmented } from '@/components/ui';
import {
  decodeUrl,
  encodeComponent,
  encodeForm,
  encodeFullUri,
  encodeUrl,
  escapedCount,
  looksDoubleEncoded,
  type UrlMode,
} from './logic';

const HINTS: Record<UrlMode, string> = {
  component: 'For one value: everything but A–Z a–z 0–9 - _ . ! ~ * \' ( ) is escaped, so / ? & = # become %2F %3F %26 %3D %23.',
  uri: 'For a whole address: : / ? # @ & = + $ , ; survive so the URL still works — spaces, accents and other unsafe characters are escaped. Square brackets are escaped too (%5B %5D), so an IPv6 host such as http://[::1]/ has to be written by hand.',
  decode: 'Turns %XX escapes back into characters. Malformed escapes are reported rather than silently dropped.',
};

export default function UrlEncode() {
  const [mode, setMode] = useState<UrlMode>('component');
  const [form, setForm] = useState(false);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      if (mode === 'decode') {
        const output = decodeUrl(input, form);
        const escapes = (input.match(/%[0-9a-fA-F]{2}/g) ?? []).length;
        return {
          output,
          warning: looksDoubleEncoded(output)
            ? 'The result still contains %XX escapes, so this text was probably encoded twice. Decode it again to get back to plain text.'
            : undefined,
          stats: [
            { label: 'Escapes decoded', value: escapes.toLocaleString() },
            { label: 'Length', value: `${input.length.toLocaleString()} → ${output.length.toLocaleString()}` },
          ],
        };
      }

      const variant = mode === 'uri' ? 'uri' : form ? 'form' : 'component';
      const output = encodeUrl(input, variant);
      const encoder = variant === 'uri' ? encodeFullUri : variant === 'form' ? encodeForm : encodeComponent;
      const changed = escapedCount(input, encoder);
      const total = [...input].length;
      return {
        output,
        stats: [
          { label: 'Escaped', value: `${changed.toLocaleString()} of ${total.toLocaleString()} characters` },
          { label: 'Length', value: `${input.length.toLocaleString()} → ${output.length.toLocaleString()}` },
        ],
      };
    },
    [mode, form],
  );

  return (
    <TextTool
      transform={transform}
      saveExtension="txt"
      inputLabel={mode === 'decode' ? 'Encoded text' : 'Plain text'}
      outputLabel={mode === 'decode' ? 'Decoded text' : 'Encoded text'}
      placeholder={
        mode === 'decode'
          ? 'https://example.com/search?q=caf%C3%A9%20con%20leche'
          : 'https://example.com/search?q=café con leche'
      }
      sampleText={
        mode === 'decode'
          ? 'https://example.com/search?q=caf%C3%A9+con+leche&page=2#resultados'
          : 'https://example.com/search?q=café con leche&page=2#resultados'
      }
      options={
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Mode">
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'component', label: 'Encode value', title: 'encodeURIComponent' },
                  { value: 'uri', label: 'Encode full URL', title: 'encodeURI' },
                  { value: 'decode', label: 'Decode' },
                ]}
              />
            </Field>
            {mode !== 'uri' && (
              <Field label="Form encoding">
                <div className="flex h-7 items-center">
                  <Checkbox
                    checked={form}
                    onCheckedChange={setForm}
                    label={mode === 'decode' ? 'Read + as a space' : 'Write spaces as +'}
                  />
                </div>
              </Field>
            )}
          </div>
          <p className="text-[11.5px] leading-[1.5] text-ink-faint">
            {HINTS[mode]}
            {mode !== 'uri' && form
              ? ' Form encoding is what a browser sends for an HTML form: a space becomes +, and ! \' ( ) ~ are escaped too.'
              : ''}
          </p>
        </div>
      }
    />
  );
}
