# Adding a tool to Toolbox

Adding a tool means creating **one folder with two files**. Nothing else in the
codebase needs to change — no index file to edit, no route to register, no
switch statement to extend.

```
src/tools/<category>/<slug>/
  tool.ts    ← metadata (eagerly loaded, must stay tiny)
  ui.tsx     ← the React component (code-split, loaded on demand)
```

`src/core/registry.ts` picks up every `src/tools/**/tool.ts` through
`import.meta.glob`, so the tool appears in the sidebar, the category grid, the
command palette, the search index and the drop-zone suggestions immediately.

---

## 1. `tool.ts` — metadata

```ts
import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'images/resize',                 // must equal the folder path, and be unique
  name: 'Resize Image',                // Title Case, what it does
  description: 'Scale images to exact sizes or social presets',  // one line, no period
  category: 'images',                  // a CategoryId from src/core/categories.ts
  icon: 'Scaling',                     // a lucide-react icon name
  weight: 80,                          // higher sorts earlier in its category
  keywords: ['resize', 'scale', 'dimensions', 'instagram', 'redimensionar'],
  accepts: { kinds: ['image'], extensions: ['jpg', 'png', 'heic'] },
  produces: ['jpg', 'png', 'webp'],
  requires: ['ffmpeg'],                // omit when nothing external is needed
  quickLabel: 'Resize this image',     // shown in drop-zone quick actions
  standalone: true,                    // set for tools that need no input file
  load: () => import('./ui'),
});
```

### Field notes

| Field | Notes |
| --- | --- |
| `id` | `category/slug`. Also the route: `/t/images/resize`. |
| `keywords` | The phrases a user would actually type — including the *result* (`"heic to jpg"`), the problem (`"reduce image"`) and Spanish equivalents. This is what makes ⌘K feel smart. |
| `accepts` | Drives the drop-zone quick actions and the file filter. `kinds` are broad classes; `extensions` are exact. `multiple: false` for single-input tools; `folders: true` for folder tools. |
| `requires` | Binary ids from `src-tauri/src/binaries.rs`. The tool page shows an install card instead of the UI when one is missing — you do not have to check yourself. |

---

## 2. `ui.tsx` — the component

Default-export a component that takes no props.

### File-processing tools

```tsx
import { useState } from 'react';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay, FileDropZone, OutputSettings, ResultPanel,
  ToolActions, ToolShell, useOutputSpec,
} from '@/components/tool';
import { Field, Section, Select } from '@/components/ui';

export default function ResizeImage() {
  const files = useToolFiles({ kinds: ['image'], filterName: 'Images' });
  const run = useToolRun('images/resize', 'Resize Image');
  const { spec, update } = useOutputSpec();
  const [width, setWidth] = useState(1920);

  const execute = () =>
    void run.execute({
      command: 'process_images',
      total: files.files.length,
      inputs: files.paths,
      label: `Resize ${files.files.length} images`,
      args: { inputs: files.paths, ops: { resize: { width } }, output: spec },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone files={files} label="Drop images here" allowFolders />
          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Size">{/* controls */}</Section>
          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>
          <ToolActions
            run={run} onRun={execute} label="Resize" icon="Scaling"
            disabled={files.isEmpty} disabledReason="Add at least one image first."
          />
        </>
      }
    />
  );
}
```

`useToolFiles` already handles the picker, drag-and-drop, folder expansion, type
filtering and files handed over from the Home quick actions. `useToolRun`
registers the job in the task centre, streams progress, writes the history entry
and posts the completion notification.

### Reading data instead of writing files

Commands that *return data* rather than producing files — `probe_media`,
`ocr_files`, `hash_files`, `extract_palette`, `find_duplicates`, `image_info`,
`pdf_info`, `list_archive`, `preview_rename`, `remote_media_info` — do not return
a `BatchResult`. Use `executeRaw<T>()`, which resolves to the command's own shape
while still registering the job and its progress:

```ts
const info = await run.executeRaw<MediaInfo[]>({
  command: 'probe_media',
  args: { inputs: files.paths },
});
```

`run.raw` holds the same value after the call. For quick, non-job lookups that
should not appear in the task centre at all, call `call<T>()` from
`@/core/bridge` directly.

### Text tools

Anything that is *text in, text out* should use `TextTool`, which supplies the
two panes, drag-and-drop of text files, copy, save, live errors and stats:

```tsx
import { TextTool } from '@/components/tool';

export default function Base64Encode() {
  return <TextTool transform={(input) => btoa(input)} saveExtension="txt" />;
}
```

Return `{ output, warning?, stats? }` instead of a bare string when you want to
report counts. Throwing inside `transform` shows a clean error panel.

---

## 3. Where the work happens

**Rust** for anything touching the filesystem, an external binary, or large
files. **TypeScript** for pure computation and for libraries that only exist in
JS (`pdf-lib`, `qrcode`, `svgo`).

### Backend commands

Call them through `run.execute({ command, args })`, which appends `jobId`
automatically. Full list in `src-tauri/src/lib.rs`.

| Command | Purpose |
| --- | --- |
| `process_images` | Convert, resize, crop, rotate, flip, compress, pad, border, round, shadow, watermark, strip metadata, target a max size — one pipeline. |
| `image_info`, `extract_palette`, `pick_color_at` | Dimensions, dominant colours, eyedropper. |
| `contact_sheet`, `generate_favicons`, `split_gif_frames` | Multi-image outputs. |
| `process_video` | Convert, compress, trim, crop, scale, fps, speed, reverse, rotate, mute, extract audio, watermark. |
| `video_to_gif`, `extract_frames`, `video_thumbnail`, `preview_frame`, `concat_media` | Video extras. |
| `probe_media` | Codec, resolution, fps, bitrate, duration, streams, tags. |
| `write_audio_tags`, `extract_cover_art`, `generate_silence` | Audio metadata and generation. |
| `pdf_to_images`, `pdf_to_text`, `pdf_read_text`, `compress_pdf`, `encrypt_pdf`, `decrypt_pdf`, `pdf_info`, `pdf_page_count`, `pdf_page_preview` | PDF work that needs Poppler / Ghostscript / QPDF. |
| `convert_document`, `pandoc_convert` | Office and markup conversion. |
| `inspect_paths`, `expand_paths`, `preview_rename`, `batch_rename`, `analyze_folder`, `flatten_folder`, `organize_folder`, `split_file`, `join_files`, `secure_delete` | File utilities. |
| `hash_files`, `hash_text`, `find_duplicates` | Hashing and deduplication. |
| `create_archive`, `extract_archive`, `list_archive` | ZIP / TAR / TAR.GZ. |
| `read_metadata`, `strip_image_metadata`, `ocr_files`, `available_ocr_languages`, `take_screenshot` | Metadata, OCR, capture. |
| `remote_media_info`, `download_media` | yt-dlp, for media you own or are licensed to save. |
| `plan_output`, `ensure_dir`, `reveal_in_finder`, `open_path`, `app_paths` | Plumbing. |

### Producing files from the frontend

Use `src/core/save.ts` so JS-side tools honour the same collision policy:

```ts
import { saveBytes, saveText, readBytes } from '@/core/save';

const bytes = await pdfDoc.save();
const result = await saveBytes(bytes, { source: files.paths[0], output: spec, ext: 'pdf' });
```

`saveBytes` asks the backend for a collision-free path, then writes. Never build
an output path by hand.

---

## 4. Rules

1. **No placeholders.** Every control must work. No "coming soon", no dead buttons.
2. **Never overwrite silently.** Always route output through `OutputSettings` +
   `useOutputSpec`, or `saveBytes`/`saveText`.
3. **No shell strings.** External programs are only ever invoked from Rust with
   an argument vector. Never interpolate a filename into a command string.
4. **Errors must be readable.** `ErrorDisplay` renders the backend's friendly
   message with technical details behind a disclosure. Throw `Error` with a
   sentence a person can act on.
5. **Batch by default.** If the operation makes sense for many files, accept many.
6. **Keep `tool.ts` tiny.** It is loaded eagerly for every tool at startup.
7. **Light mode first.** Use the design tokens (`text-ink`, `bg-panel`,
   `border-line`, …) — never hard-coded hex values in class names.

## 5. Checklist

```bash
npm run typecheck        # must be clean
npm run lint             # must be clean
node scripts/generate-icons.mjs   # if you used a new icon name
npm test                 # add a test for non-trivial pure logic
npm run tauri dev        # try the tool with a real file
```

## 6. Testing

Pure logic goes in a `logic.ts` beside the component so it can be tested without
React:

```
src/tools/text/case-converter/
  tool.ts
  ui.tsx
  logic.ts
  logic.test.ts
```

See `src/tools/text/case-converter/logic.test.ts` for the pattern.
