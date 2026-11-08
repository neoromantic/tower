# Touch interface

The SDL/Wasm shell keeps a single running tower. Normal mode is one-finger pan, two-finger pan/zoom and tap to inspect. Build opens a categorized visual catalog; selecting an unlocked item enters preview mode. Tap or drag in the world to position/extend a ghost; only Place mutates the tower. Cancel discards it. The inspector offers object controls and confirmed deletion. Settings holds styles, zoom, installation, exports, loading and advanced classic menus.

## Engine contract

All coordinates below are CSS pixels relative to the canvas (not device pixels or SDL UI units). Call after game startup through `Module.ccall`. The engine owns world conversion, ghost drawing, legality, placement and stable selection. No simulated build clicks precede confirmation.

| Export | Result and behavior |
| --- | --- |
| `ct_set_zoom_at(double zoom, double x, double y)` | Void. Clamp zoom and keep the world point under x/y fixed, except camera bounds. |
| `ct_preview(double x1, double y1, double x2, double y2)` | Number: 1 if valid. Preview current positive tool, including row/shaft drag, without changing world, money or save. Replaces previous ghost. |
| `ct_place()` | Number: 1 on success. Revalidate and commit pending preview once. 0 leaves tower unchanged. |
| `ct_cancel_preview()` | Void. Clear ghost/pending placement. |
| `ct_inspect(double x, double y)` | JSON string `{name,details,canDelete,canUse}`. Empty name means no object. Select stable object; no classic window opens. Details is display text. |
| `ct_delete_selected()` | Number: 1 on successful deletion. Revalidate selected target; never delete a replacement at a stale index. |
| `ct_use_selected()` | Void. Open the selected object's existing controls. |

`ct_ui_state()` additionally supplies numeric `speed` (0 paused, 1 normal, 2 fast) and `unlocked` (array of positive ItemType IDs). The shell uses this to show campaign locks and the real simulation speed after classic menus change it. All original exports remain as described in engine-web-api.md. These narrow APIs are renderer-independent contracts for a future UI; they authorize no renderer migration.

## Catalog

`web/art/catalog/{style}/{type}.png`: style is schematic, modern-pixel, warm-dollhouse or miniature-3d; type is numeric ItemType 1–25. `web/art/catalog/generate.py` reproduces these derivatives using Pillow and existing source plates only, with SHA-256/crop provenance in `provenance.json`. Room previews show a centered 2:1 detail crop within each registered room cell; transport and structure previews retain their full source cell. Thumbnails use source-cell registration, smooth downsampling and CSS contain; no NE sprite enlargement and no new generation. Makefile's recursive art copy includes them. The service worker precaches all four catalogs for offline style switching.

The catalog metadata in app.js is the complete category/name/ID map. Card locks come from the engine, not duplicate campaign rules. Interface sheets use native dialog focus containment; SDL keyboard input is stopped while a sheet is open. Advanced SDL dialogs still receive canvas clicks. Integration acceptance (including actual iPhone) belongs to the integrated build, not this source-only change.
