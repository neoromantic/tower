# Engine web API

Call these through `Module.ccall` after `Module.callMain` has entered the game loop. All exports use `EMSCRIPTEN_KEEPALIVE`; the existing ASYNCIFY loop and simulation stay in place.

| Export | Result / arguments |
| --- | --- |
| `ct_set_style(int style)` | Number: 1 on success, 0 if the pack cannot load. 0 schematic, 1 modern-pixel, 2 warm-dollhouse, 3 miniature-3d. Starts with schematic. Rebuilds sprite textures/composites/keys in the same Tower/GameSim; audio and text remain loaded. |
| `ct_resize(int cssWidth, int cssHeight, double dpr)` | Void. Supply the **canvas world box**, excluding DOM bars. Engine owns the physical canvas buffer (`CSS × DPR`); shell owns CSS dimensions. Call on resize/orientation/DPR changes and once after starting. |
| `ct_set_zoom(double zoom)` | Void. World scale in CSS pixels per world pixel, clamped to 0.5–3. UI has an independent scale. |
| `ct_set_ui_scale(double scale)` | Void. Positive requested SDL UI scale, independent of world zoom and DPR. Apply the same setting to DOM controls. Preserved across resize; capped to fit a 380 × 560 logical dialog area. |
| `ct_pan(double dx, double dy)` | Void. Drag deltas in CSS pixels; moves the camera with the drag. Cancels pending build placement. |
| `ct_tool(int tool)` | Void. Positive values are `ItemType` from `src/tower.h`, 0 finger, -1 bulldoze, -2 inspect, -3 pan. Locked campaign tools are ignored. |
| `ct_control(int action)` | Void. 0 toggle pause, 1 normal, 2 fast, 3 save and automatically sync IDBFS. |
| `ct_save()` | Number: 1 if current active save was written to MEMFS, 0 if writing failed. Shell must run `FS.syncfs(false, callback)` and wait for callback before reporting durable success. |
| `ct_ui_state()` | String containing JSON: money, day, hour, minute, stars, population, paused, currentTool, style, zoom, saveBlocked, modal. `modal` includes open SDL dialogs/menus; send their clicks to SDL instead of panning. `saveBlocked` means an incompatible existing save blocked automatic saves. |
| `ct_menu(int menu)` | Void. Opens a real existing SDL menu inside the phone viewport. -1 closes; 0 Game, 1 Build Res., 2 Build Com., 3 Transport, 4 Services, 5 Speed, 6 Options (including Call Fire Rescue), 7 Windows (Find Person/Tenant), 8 View (financial report), 9 Help. SDL clicks choose its entries. |

`ct_ui_state`: `Module.ccall('ct_ui_state', 'string', [], [])`. Numeric arguments use ccall type `number`; void return uses `null`.

Keep ordinary SDL mouse/click delivery on the canvas for placement, dragging a build, inspection, dialogs and elevator controls. The engine converts physical SDL coordinates into UI units once and converts the chosen world point through camera zoom once. Shell must not pre-transform SDL coordinates. Pan/pinch gestures must suppress SDL down/up delivery for that gesture; a drag recognized after a delivered SDL down must call `ct_pan` before release to cancel placement. Check `modal` before intercepting canvas gestures. Pan tool ignores background taps.

The classic floating toolbar/info/map panes and menu bar start hidden in the browser. DOM must offer `ct_menu` access to Game/Options/Windows/View so all original decisions remain reachable. Legacy dialogs fit a real viewport of at least 380 × 560 logical UI units, scaled separately from the world; no fixed 960 × 720 frame is shrunk to fit the phone.

Legacy packs are preloaded from `data/styles/{schematic,modern-pixel,warm-dollhouse,miniature-3d}/tower.dat`, along with the HD packs, without source images. Shell distribution files are `app.js`, `app.css`, `manifest.webmanifest`, version-stamped `sw.js`, `index.data` and `art/`.

Integration build: `make web` (requires the installed `emcc` toolchain). Worker changes deliberately do not run a build; the controller performs the integrated build and browser smoke once all packs and shell files are ready.

## Confirmed touch placement and object selection

All new coordinates are CSS pixels relative to the canvas. These calls are
renderer-independent boundaries; see [touch-ui.md](touch-ui.md) for shell flows.

| Export | Contract |
| --- | --- |
| `ct_set_zoom_at(double zoom, double x, double y)` | Clamps zoom and preserves the anchor's world point, subject to camera bounds and logical-pixel raster registration. |
| `ct_preview(double x1, double y1, double x2, double y2)` | Returns 1 for a legal preview of the positive tool. Stores world cells and draws a ghost; it changes no Tower, money, save or random stream. Rooms form rows, shafts form vertical runs, floor uses a continuous span. A trial Tower uses the actual placement/charge rules. |
| `ct_place()` | Revalidates and commits the stored preview once. Returns 1 on success and clears it; 0 restores the Tower with no partial row or charge. Calls the existing build notification/audio path on success. |
| `ct_cancel_preview()` | Clears pending ghost/drag state. Tool changes also clear it. |
| `ct_inspect(double x, double y)` | JSON `{name,details,canDelete,canUse}`. Selects a tenant/shaft/stair or queue person without opening a window; empty name for empty space. |
| `ct_delete_selected()` | Returns 1 if the selected target was removed. Uses its ID/type/world registration, independent of camera motion. A shaft selection deletes the shaft, not a moving car. The DOM caller confirms deletion before calling this export; no second SDL confirmation opens. Protected/construction units report canDelete=0. |
| `ct_use_selected()` | Opens the selected tenant, elevator or person controls in the existing SDL dialog. Revalidates identity. |
| `ct_render_stats()` | JSON CPU render timing and allocation counters described in [hires-renderer.md](hires-renderer.md). Intended for bounded integration profiling. |

`ct_ui_state` also includes numeric `speed` (0 paused, 1 normal, 2 fast; legacy
turbo displays as fast) and `unlocked`, an array of positive ItemType IDs checked
by the engine's existing campaign gate. Opening an advanced menu clears selection
and pending placement, so a new/load action cannot reuse a previous selection.

The trial placement boundary in `tower.h`, `tower_preview_place`, applies the
same rules and charges to a caller-owned Tower copy without drawing a random
cinema movie. It exists to keep touch preview validation aligned with placement,
including deck/lobby charges and connected shaft segments. Actual placement's
randomness and simulation rules are unchanged.

HD packs are preloaded from each style's `hd/` directory. Distribution and offline
caches now also require **index.data**; source plates are not distributed.
