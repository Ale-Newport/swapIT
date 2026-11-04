# Radial menu — architecture and native contract

Toolbox has a second window, `radial`: a transparent, borderless, always-on-top
overlay that shows a circular ("donut") menu at the cursor. It is the fastest way
to act on files: select them in Finder, press the global shortcut, pick a petal.

```
 Finder selection ─┐
 ⌃⌥Space hotkey ───┤                    ┌────────── radial window (React) ───────────┐
 Option+drag ──────┼─► Rust: radial ──► │  Ring · liquid-glass petals · search       │
 Open With / Dock ─┤   (window, glass,  │  actions catalogue → runTask → HUD pill     │
 tray / toolbox:// ┘    Finder context)  │  cards: New file · Record audio · Paste    │
                                         └─────────────────────────────────────────────┘
 main window ── drop files / ⌘O / Home tiles ──► radial_show (same window, same UI)
```

Everything the ring can do is implemented on the frontend (`src/radial/`) on top of
the existing backend commands (`process_images`, `process_video`, …), so the ring
and the 169 full tools never diverge. The native layer only owns what a webview
cannot: the window, the global shortcut, Finder, the blur behind the glass, and
the drag monitor.

---

## 1. Settings (stored in `settings.json`, camelCase, via `update_settings`)

The Rust side reads these from `settings::load().extra`. Defaults apply when absent.

| key | type | default | meaning |
| --- | --- | --- | --- |
| `radialEnabled` | bool | `true` | master switch for the global shortcuts and the drag trigger |
| `radialShortcuts` | `{ radial, note, record }` of accelerator strings | `{ radial: "Control+Alt+Space", note: "Control+Alt+N", record: "Control+Alt+R" }` | Tauri accelerator syntax; empty string disables that one |
| `radialHoldToSelect` | bool | `true` | holding the shortcut and releasing over a petal picks it |
| `radialDragEnabled` | bool | `true` | the Filee gesture: drag files from anywhere while holding the modifier |
| `radialDragModifier` | `"alt" \| "ctrl" \| "shift" \| "cmd"` | `"alt"` | modifier for the drag gesture |
| `radialCreateDir` | string \| null | `null` (= `~/Desktop`) | where new files go when Finder gives no folder |
| `keepRunning` | bool | `true` | closing the main window hides it; the app stays alive for the shortcut |
| `menuBarIcon` | bool | `true` | tray icon |
| `showInDock` | bool | `true` | `false` → `ActivationPolicy::Accessory` |
| `radialOpacity`, `radialAccent`, `radialScale`, `radialTheme`, `radialSounds` | – | – | frontend-only appearance prefs; Rust ignores them except `radialTheme` (`auto/light/dark`) which picks the glass appearance |

After `update_settings` succeeds the backend must **reconcile** (re-register
shortcuts, start/stop the drag monitor, show/hide the tray, switch activation
policy) — the frontend never calls a "register shortcut" command. Failures (e.g.
shortcut already taken) are reported by `radial_status`, not by failing the patch.

---

## 2. The radial window

* label `radial`, created hidden at startup, kept alive (instant show).
* `transparent`, `decorations: false`, `shadow: false`, `alwaysOnTop`, `skipTaskbar`,
  `resizable: false`, `acceptFirstMouse`, `dragDropEnabled: true`,
  visible on all spaces and above full-screen apps (window level ≥ pop-up menu,
  `canJoinAllSpaces | fullScreenAuxiliary`).
* `window-state` plugin must **not** persist it (deny-list).
* default size **400×400**; ring is always centred in the window (petals 82–180 px around a 70 px core).
* capability: add `"radial"` to `capabilities/default.json` `windows`.

### Native glass

Real blur behind the window is native, because a webview cannot see what is
behind its own window. Under the web content the backend inserts an
`NSVisualEffectView` (`blendingMode = behindWindow`, `state = active`, material
chosen from the appearance: light → `.popover`/`.underWindowBackground`-like,
dark → `.hudWindow`), and **shapes it with `maskImage`** so only the ring, the
core disc, a pill or a rounded card is blurred. The mask is rendered in Rust
(`image` crate, 2× supersampled, anti-aliased) from the shape descriptor the
frontend sends in `radial_set_layout`. The webview above is fully transparent and
draws the tint, rim light, specular highlights, icons and labels.

The CSS radii in the frontend and the mask radii MUST be identical, so
the shapes are defined once, in `src/radial/geometry.ts`, and sent verbatim.

---

## 3. Commands (Rust → exposed to JS)

All return `AppResult<T>`; JSON is camelCase.

### `radial_show`

```ts
radial_show({ args: {
  paths?: string[];          // files/folders to act on
  folder?: string | null;    // create-target override
  trigger?: Trigger;         // default 'app'
  intent?: string;           // default 'ring'
  at?: { x: number; y: number } | null;   // screen coords (logical, top-left origin); default = cursor
}}) => void
```
Same code path as the hotkey: remember the frontmost app, position the window,
emit `radial://open`, show, activate.

### `radial_hide`
`radial_hide({ restoreFocus?: boolean })` — hide the window, emit `radial://hidden`.
`restoreFocus` (default true) re-activates the app that was frontmost when the
ring opened (so Finder gets its focus back).

### `radial_release_focus`
Re-activate the previous app **but keep the window visible** (used when the ring
collapses into the progress pill).

### `radial_set_layout`
```ts
radial_set_layout({ layout: {
  width: number; height: number;                       // logical px
  anchor: 'cursor' | 'keep' | 'top' | 'center';
  shape: { kind: 'ring'; outer: number; inner: number; core: number }
       | { kind: 'rrect'; radius: number }
       | { kind: 'none' };
  sticky: boolean;                 // true → blur does NOT hide the window
  appearance?: 'auto' | 'light' | 'dark';
}}) => void
```
* `keep` – keep the current window centre; `cursor` – centre on the cursor, clamped
  to the visible frame of the monitor under the cursor; `top` – horizontally centred
  on that monitor, 28 px below the top of its visible frame; `center` – centred.
* Order of operations must not flash: set mask → resize/move.
* A `ring` shape is centred in the window: `outer`/`inner` are the petal ring's radii,
  `core` the radius of the separate centre disc (the gap `core..inner` is transparent).

### `radial_status`
```ts
RadialStatus = {
  shortcuts: Record<'radial'|'note'|'record', { accelerator: string; registered: boolean; error: string | null }>;
  drag: { enabled: boolean; running: boolean; modifier: string };
  finderAction: { installed: boolean; path: string };
  automation: 'granted' | 'denied' | 'unknown';   // permission to control Finder
  tray: boolean;
  version: string;
}
```

### Finder Quick Action
`install_finder_action() -> string` (path) / `uninstall_finder_action()`.
Creates `~/Library/Services/Open in Toolbox.workflow` (a Quick Action that receives
the selected files in Finder and runs `open -a Toolbox --args`/`open toolbox://…`),
then refreshes the Services cache (`/System/Library/CoreServices/pbs -update`).
It appears under Finder ▸ right-click ▸ Quick Actions, and can be given a keyboard
shortcut in System Settings ▸ Keyboard ▸ Shortcuts ▸ Services.

### Misc
* `open_in_main({ route: string, files?: string[] })` — show + focus the main window and
  emit `app://navigate` `{ route, files }` (App.tsx navigates with `state: { files }`).
* `open_privacy_pane({ pane: 'automation' | 'microphone' | 'accessibility' | 'files' })`.
* `request_automation_permission() -> 'granted' | 'denied'` — fires a harmless Apple
  Event at Finder so macOS shows its prompt.

---

## 4. Events (Rust → `radial` window, `app.emit_to("radial", …)`)

```ts
type Trigger = 'hotkey' | 'drag' | 'open-with' | 'app' | 'tray' | 'service' | 'url' | 'note-hotkey' | 'record-hotkey';

'radial://open'     RadialOpenPayload
  {
    id: number;                       // increments each show
    trigger: Trigger;
    intent: string;                   // 'ring' | 'create:text' | 'create:markdown' | 'record' | 'paste' …
    paths: string[];                  // absolute paths to act on (may be empty)
    folder: string | null;            // where creations land
    frontApp: { name: string; bundleId: string } | null;
    holdKey: boolean;                 // true while the hotkey that opened it is still down
    permission: 'automation_denied' | null;
    cursor: { x: number; y: number }; // logical screen coords, informational
  }
'radial://released'  {}               // hotkey key-up (only meaningful when holdKey)
'radial://hidden'    {}               // the window was hidden by anything
'radial://drag-ended' {}              // drag trigger: mouse released with no drop
```
The window must `show()` only **after** emitting `radial://open`, and the frontend
renders nothing (fully transparent) until it receives it.

`app://navigate` → emitted to `main`: `{ route: string, files?: string[] }`.

---

## 5. Triggers

| trigger | how |
| --- | --- |
| `hotkey` | global shortcut press. If Finder is frontmost: selection → `paths`, front window's folder (or Desktop) → `folder`. Otherwise `paths = []`, `folder = radialCreateDir ?? ~/Desktop`. Hold-to-select: `holdKey = true`, `radial://released` on key-up. |
| `note-hotkey` / `record-hotkey` | same context, `intent = 'create:markdown'` / `'record'` |
| `drag` | global `NSEvent` monitors (mouse only, no permissions) for `leftMouseDragged` / `leftMouseUp`. During a drag whose **drag pasteboard** (`NSPasteboardNameDrag`) holds file URLs and while `NSEvent.modifierFlags` contains the configured modifier → show the ring at the cursor **without activating** the app. On `leftMouseUp` with no drop within ~350 ms → hide + `radial://drag-ended`. A drop on the window cancels the timer (the webview's own drag-drop event carries the paths). |
| `open-with` | `RunEvent::Opened` with `file://` URLs (Finder ▸ Open With ▸ Toolbox, dropping files on the Dock icon) → ring at the cursor. |
| `url` | `toolbox://radial?path=…&path=…&intent=…&folder=…` (`RunEvent::Opened`). Also used for automation/testing. |
| `service` | the Finder Quick Action → `open -a Toolbox <files>` (`open-with` with `trigger: 'service'` when the env/arg marks it, otherwise same as open-with). |
| `tray` | tray menu entries (`Radial menu`, `New text file`, `New Markdown note`, `Record audio`, `Open Toolbox`, `Settings…`, `Quit`). |
| `app` | `radial_show` from the main window. |

`Info.plist` additions: `NSAppleEventsUsageDescription`, `NSMicrophoneUsageDescription`,
`NSDesktopFolderUsageDescription`, `NSDocumentsFolderUsageDescription`,
`NSDownloadsFolderUsageDescription`, `CFBundleURLTypes` (`toolbox`), and
`CFBundleDocumentTypes` (`public.item`, role Viewer, rank Alternate) so Toolbox shows
up under Finder ▸ Open With for any file.

---

## 6. File commands (`cmd/quick.rs`)

camelCase JSON. Names are Finder-style: `Untitled.md`, `Untitled 2.md`, `report copy`,
`report copy 2`. Nothing is ever overwritten; nothing is ever permanently deleted.

| command | args | returns |
| --- | --- | --- |
| `create_text_file` | `dir, name, ext, content, executable?` | `FileResult` |
| `create_folder` | `dir, name, moveInto?: string[]` | `BatchResult` (folder first) |
| `trash_paths` | `paths` | `number` moved to the Trash |
| `duplicate_paths` | `paths` | `BatchResult` |
| `move_paths` | `paths, destDir` | `BatchResult` |
| `copy_paths_to_clipboard` | `paths` | `()` (Finder-pasteable) |
| `reveal_many` | `paths` | `()` |
| `open_with` | `paths, app?` | `()` |
| `quick_look` / `quick_look_close` | `paths` | `()` |
| `set_desktop_picture` | `path` | `()` |
| `paste_clipboard_as_file` | `dir` | `BatchResult` — text → `.txt`/`.md`/`.json`/`.csv`/`.html` (sniffed), image → `.png`, file URLs → copied in |
| `clipboard_summary` | – | `{ kind: 'text'|'image'|'files'|'empty', preview: string, count: number }` |
| `file_icon` | `path, size` | `string` (PNG data URL from `NSWorkspace`) |
| `file_thumbnail` | `path, size` | `string` (PNG data URL via Quick Look, cached in temp) |
| `read_text_file` | `path, maxBytes?` | `string` |
| `default_folders` | – | `{ desktop, documents, downloads, home }` |

---

## 7. Watch folders

`settings.json` → `watchRules: [{ id, folder, action, enabled }]`. A poller thread
(`src-tauri/src/watch.rs`) lists each enabled rule's folder every ~1.5 s, waits until a
new file has kept the same size for ~2.6 s (so downloads are never read half-written),
skips hidden/partial files, and emits to the radial window:

```ts
'radial://watch' { ruleId: string; action: string; path: string; folder: string }
```

The first pass over a folder only records what is already there. The webview (`src/radial/watch.ts`)
looks `action` up in the catalogue for that file, runs it quietly with results in
`<folder>/Toolbox Output`, writes a history entry and posts a notification. Only the top level
of the folder is scanned and results go into a sub-folder, so a rule cannot feed on its own output.

## 8. Extending the ring

An action is a `RadialItem` (`src/radial/model.ts`). Add one to a catalogue builder in
`src/radial/catalog/` and it appears on the right page, in search, and in watch-folder rules:

```ts
task({
  id: 'edit:sharpen',                // unique; also what watch rules and tests refer to
  label: 'Sharpen',                  // ≤ 12 characters, on the petal
  title: 'Sharpen the image',        // in the centre disc while hovered
  hint: 'Unsharp mask, saved as a new file',
  icon: 'Sparkles',                  // lucide name — then `node scripts/generate-icons.mjs`
  glyph: undefined,                  // or a short badge such as 'PNG' instead of the icon
  keywords: ['sharp', 'enhance'],    // what people type to find it
  needs: ['magick'],                 // programs it needs; unavailable ones are dimmed with an install command
  run: (ctx) => ctx.job({ command: 'process_images', label: 'Sharpen', args: { … } }),
})
```

* `task(...)` collapses the ring into the progress pill and reports what `run` returns
  (a `BatchResult`, or an `ActionResult` with a title, detail, snippet and buttons).
* `ui(...)` is for items that open a card, a dialog or the main window and report nothing themselves.
* `ctx.job` / `ctx.jobs` run backend commands as tracked tasks (progress, cancel); `ctx.data` is for
  commands that return data rather than files; `ctx.output({ suffix })` is the user's output policy.
* Put the id in `suggestedIds` (`catalog/index.ts`) to give it a place on a kind's first page.

Keep geometry in `src/radial/geometry.ts`: the CSS radii and the native blur mask are both derived
from it, so changing a number there moves both.

## 9. Dev preview

`npm run dev`, then open `http://localhost:1420/#/radial-demo` in a browser. The IPC is mocked
(`src/radial/dev/Demo.tsx`) and a masked `backdrop-filter` stands in for the macOS blur, so the ring,
cards, pill and search can be iterated on without building the app.

## 10. As built — notes and deviations

* **Cold start.** The first `radial://open` can fire before the overlay's React tree has mounted.
  `radial_last_open() -> OpenPayload | null` returns the ring that is currently up; `RadialApp`
  calls it on mount.
* **URL scheme.** `toolbox://` accepts the hosts `radial`, `note`, `record`, `new` and
  `open?route=/settings`. `toolbox://radial?path=…&intent=create:markdown&folder=…` is the
  quickest way to drive the overlay from a script, a Shortcut or a test.
* **Finder Quick Action hand-off.** The workflow writes the selection to
  `~/Library/Caches/app.toolbox.desktop/service-selection.txt` and opens
  `toolbox://radial?trigger=service&list=<file>`; the handler only reads files inside that folder
  and deletes the file after reading, so a long selection never has to fit in a URL.
* **Glass materials.** Light appearance uses `NSVisualEffectMaterialHUDWindow`, dark uses `Menu`
  (chosen by eye — the others read as flat or too opaque). `auto` follows the system.
* **Focus.** Blur-to-hide only applies once the window has been key at least once and while it is not
  `sticky`; `radial_release_focus` also marks it sticky (the pill must survive the user clicking away).
  Pressing the shortcut again while the ring is up closes it.
* **Drag positions on macOS.** wry reports drag-and-drop positions in AppKit *points* even though Tauri
  types them as physical pixels, so on macOS they must **not** be divided by `devicePixelRatio`.
  `src/core/dropPoint.ts` is the one place that knows; both the ring and the main window's drop
  targets use it.
* **Plugins.** `tauri-plugin-global-shortcut` is pinned to `~2.3.2`: newer releases require Tauri 2.12
  and break the `@tauri-apps/api` 2.11 match.
* **Not verified on hardware:** the ring over a full-screen app and on a second display (the window
  level and collection-behaviour flags are set), and release-build latency of the first show (the
  ring's mask is pre-rendered at start-up and cached).

## 11. Design rules (v2)

The first version had eight petals per page, seven pages and scroll-to-flip. It was too much, so:

1. **Six petals at most**, on every ring (`MAX_SLOTS` in `geometry.ts`; the window is 400×400).
2. **The first ring is for *these* files** — a few direct actions chosen per kind (`filesRoot` in
   `catalog/index.ts`), never a menu of everything.
3. **Everything else is a sub-ring** (`RadialItem.children`, built with `menu()`), at most three levels deep.
   No pages, no scroll-to-flip; the middle disc is the way back, `⎋` steps out one level at a time.
4. **Finder's own right-click actions are not offered** — open, Quick Look, reveal, copy, compress to zip, duplicate,
   move, rename, new folder, Trash, screenshots. `catalog/index.test.ts` fails if one of them comes back.
5. **Typing finds anything**: `MenuModel.pool` holds every action, including those no ring shows and every tool of
   the full app.
