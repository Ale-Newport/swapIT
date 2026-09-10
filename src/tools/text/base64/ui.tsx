import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Alert, Button, Checkbox, Field, Segmented, Textarea } from '@/components/ui';
import { revealInFinder } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { saveAs } from '@/core/save';
import type { FileResult } from '@/core/types';
import { decodeInput, encodeText, suggestedFilename, WRAP_WIDTH } from './logic';

type Mode = 'encode' | 'decode';

export default function Base64Tool() {
  const [mode, setMode] = useState<Mode>('encode');
  const [urlSafe, setUrlSafe] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [saved, setSaved] = useState<{ file: FileResult; forInput: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      if (mode === 'encode') {
        const output = encodeText(input, { urlSafe, wrap });
        const sourceBytes = new TextEncoder().encode(input).byteLength;
        const base64Chars = output.replace(/\n/g, '').length;
        return {
          output,
          stats: [
            { label: 'Input', value: `${formatBytes(sourceBytes)} of UTF-8` },
            { label: 'Base64', value: `${base64Chars.toLocaleString()} characters` },
            {
              label: 'Overhead',
              value: sourceBytes ? `+${Math.round(((base64Chars - sourceBytes) / sourceBytes) * 100)}%` : '—',
            },
          ],
        };
      }

      const result = decodeInput(input);
      const stats = [
        { label: 'Decoded', value: formatBytes(result.bytes.length) },
        { label: 'Looks like', value: result.sniffed?.label ?? (result.text === null ? 'Binary data' : 'UTF-8 text') },
      ];
      if (result.text === null && result.bytes.length > 0) {
        return {
          output: '',
          warning: `These ${formatBytes(result.bytes.length)} are not UTF-8 text${
            result.sniffed ? ` — they look like a ${result.sniffed.label}` : ''
          }. Use “Decode to file” to write them out.`,
          stats,
        };
      }
      return { output: result.text ?? '', stats };
    },
    [mode, urlSafe, wrap],
  );

  const saveDecoded = async (input: string) => {
    setSaveError(null);
    try {
      const result = decodeInput(input);
      if (result.bytes.length === 0) {
        setSaveError('There is nothing to write yet — paste some base64 first.');
        return;
      }
      const file = await saveAs(result.bytes, suggestedFilename(result));
      if (file) setSaved({ file, forInput: input });
    } catch (err) {
      setSaved(null);
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const renderDecoded = (output: string, input: string) => {
    let bytes = 0;
    let name = 'decoded.bin';
    try {
      const result = decodeInput(input);
      bytes = result.bytes.length;
      name = suggestedFilename(result);
    } catch {
      /* the error panel is showing instead of this */
    }
    const current = saved && saved.forInput === input ? saved.file : null;
    return (
      <div className="space-y-2">
        <Textarea
          value={output}
          readOnly
          rows={11}
          placeholder={bytes ? 'These bytes are not text — write them to a file instead' : 'The decoded text appears here'}
          className="w-full bg-canvas"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            icon="Download"
            disabled={bytes === 0}
            onClick={() => void saveDecoded(input)}
          >
            Decode to file…
          </Button>
          <span className="text-[11.5px] text-ink-faint">
            {bytes ? `${formatBytes(bytes)} → ${name}` : 'Writes the raw decoded bytes, text or not'}
          </span>
        </div>
        {saveError && (
          <Alert tone="danger" title="Could not write the file">
            {saveError}
          </Alert>
        )}
        {current && (
          <Alert
            tone="success"
            action={
              <Button size="sm" variant="secondary" icon="FolderOpen" onClick={() => void revealInFinder(current.path)}>
                Show
              </Button>
            }
          >
            Saved {current.name} ({formatBytes(current.size)}).
          </Alert>
        )}
      </div>
    );
  };

  return (
    <TextTool
      transform={transform}
      saveExtension="txt"
      inputLabel={mode === 'encode' ? 'Text' : 'Base64'}
      outputLabel={mode === 'encode' ? 'Base64' : 'Decoded text'}
      placeholder={mode === 'encode' ? 'Paste or type text here…' : 'SGVsbG8sIHdvcmxkIQ=='}
      sampleText={mode === 'encode' ? 'Café con leche — 100% local 😀' : 'Q2Fmw6kgY29uIGxlY2hlIOKAlCAxMDAlIGxvY2FsIPCfmIA='}
      renderOutput={mode === 'decode' ? renderDecoded : undefined}
      options={
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Mode">
              <Segmented
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setSaveError(null);
                }}
                options={[
                  { value: 'encode', label: 'Encode' },
                  { value: 'decode', label: 'Decode' },
                ]}
              />
            </Field>
            {mode === 'encode' && (
              <>
                <Field label="Alphabet">
                  <div className="flex h-7 items-center">
                    <Checkbox checked={urlSafe} onCheckedChange={setUrlSafe} label="URL-safe (- and _, no padding)" />
                  </div>
                </Field>
                <Field label="Lines">
                  <div className="flex h-7 items-center">
                    <Checkbox checked={wrap} onCheckedChange={setWrap} label={`Wrap at ${WRAP_WIDTH} characters`} />
                  </div>
                </Field>
              </>
            )}
          </div>
          <p className="text-[11.5px] leading-[1.5] text-ink-faint">
            {mode === 'encode'
              ? 'Text is converted through its UTF-8 bytes, so accents, CJK and emoji survive intact — plain btoa would mangle or refuse them.'
              : 'Line breaks, missing padding, the URL-safe alphabet and a leading data: prefix are all accepted. Bytes that are not text can be written straight to a file.'}
          </p>
        </div>
      }
    />
  );
}
