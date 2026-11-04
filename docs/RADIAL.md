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
| `menuBarMode` | bool | `false` | **menu bar only** (see §12): implies `keepRunning` and `menuBarIcon`; the Dock icon exists only while the main window is open; a login launch does not open the window |
| `radialLayouts` | `{ [kind]: { order: string[]; off: string[] } }` | `{}` | the user's own rings, per kind of file (see §13). Rust ignores it |
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

### `radial_suspend_shortcuts`
`radial_suspend_shortcuts({ suspended: boolean })` — the settings page is recording a new shortcut: unregister every
global shortcut (`true`) or register them again from the settings (`false`), so pressing the current combination
does not fire it. Releases itself after 60 s if the page never answers.

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

## 12. Menu bar mode — the ring without the app open

`menuBarMode: true` makes Toolbox a menu bar utility: only the icon at the top of the screen, and the ring and its
shortcuts work as they always do.

* `RadialConfig::keeps_running()` and `tray_visible()` are `true` whatever `keepRunning` / `menuBarIcon` say, so the
  process outlives the window and the icon is always there to bring the window back.
* **Dock icon only while the window is open.** `RadialConfig::dock_icon(main_visible)` → `ActivationPolicy::Regular`
  while the main window is shown, `Accessory` the rest of the time (`radial::sync_dock`, called on show, on close
  and from `reconcile`). Without the mode, `showInDock` decides as before.
* **Quiet login launch.** The autostart plugin starts the app with `--background` (`radial::BACKGROUND_FLAG`). The
  main window is created hidden (`"visible": false` in `tauri.conf.json`, and `StateFlags::VISIBLE` is left out of
  the window-state plugin so a saved "hidden" never decides anything) and `radial::launch_main_window` shows it unless
  `quiet_launch(background)` — i.e. unless the icon and keep-running can bring it back. Opening Toolbox from
  Launchpad, the Dock or `open` always shows the window.
* `radial::refresh_launch_agent` rewrites a login item that points at this very executable but predates the flag.
  It never touches one that points anywhere else, so a development build cannot take over the installed app's.
* ⌘Q still quits (it is the Mac convention, and the icon's *Quit Toolbox* does the same). Closing the window with the red button
  is what leaves the icon behind (⌘W is the app's own “back”).
* The tray menu gains *Customize Rings…* (`/radial#rings`) next to *Settings…*.

## 13. Your own rings

`src/radial/layouts.ts`. A kind of file (`LayoutKey`: `create` for "nothing selected", `image`, `video`, `audio`,
`pdf`, `document`, `text` for text/data/code, `svg`, `archive`, `folder`, `mixed`) can have a saved layout:

```ts
radialLayouts: { image: { order: ['convert:jpg', 'edit:compress', …], off: ['convert:tiff', …] } }
```

* The editor (`src/radial/LayoutEditor.tsx`, *Radial menu ▸ Your rings*) lists every action a kind can do — the
  union over a few sample selections (`catalog/samples.ts`) — as one list. What is on, in order, fills the ring: the
  first five on the first ring and "More ›" for the rest, repeated once more, so **16 actions fit** (5 + 5 + 6, three
  levels deep, six petals a ring — the rules of §11 still hold). Anything beyond that, or switched off, leaves the
  rings but stays in `MenuModel.pool`, so typing on the ring still finds it.
* Without a saved layout nothing changes: the hand-built ring of `filesRoot` / `createRoot` stays. The editor starts
  from it (what it reaches is on, up to the 16 that fit) and the first change saves a layout.
* `buildMenu({ layouts })` applies it (`applyLayout`). It tolerates a hand-edited file (`sanitizeLayouts`), ids this
  selection cannot do (a JPG has no "PNG → JPG"), actions an update adds later (they go last, on only if the standard
  ring had them) and an empty result (falls back to the standard ring).
* `MenuModel` also returns `standard` (the hand-built first ring) and `candidates` (every action of the kind).

