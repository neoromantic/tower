# Three.js browser presentation

The default browser presentation uses Three.js for world drawing and DOM controls for every in-game panel. Native builds retain SDL. The existing C simulation, building rules and save layout remain authoritative; the browser consumes read-only world snapshots and semantic commands documented in [three-api.md](three-api.md).

The orthographic scene uses source-resolution room, person, transport and effect crops, smooth filtering and a DPR-sized render buffer. Interior source aspect ratios are preserved: narrow footprints crop centrally; long rooms repeat the source horizontally. Concrete edges have real shallow geometry. Camera-dependent tilt, distant city and cloud layers provide restrained parallax during pan and zoom. Grid picking intersects the actual camera plane, including its tilt; zoom preserves the pointer's world anchor.

Settings switches four existing styles inside the current simulation. Warm dollhouse is the initial browser preference. State lighting, construction, people, queues, moving cabins, stairs, trains, parking, fire, rescue, ceremony and find markers come from the C snapshot. Weather and map overlays use current simulation state. The compact Build/Inspect/Pan toolbar previews an affordable native construction plan with exact new footprints, skipped spans and price. Build commits that stored plan; Cancel changes nothing. A compact navigable minimap shows actual rooms, shafts, cabins and viewport.

Every native menu group is represented by DOM. The inspector, finance, analytics, tuning, pricing, finding, elevators, names, movies and decisions are structured panels. Audio uses the Web Audio API and original procedural synthesis for the 52 semantic sound IDs, including managed fire/build loops, category volume, mute and background-tab suspension. No image generation or external AI service is involved in this migration.

## Build and verify

Requires Bun, Emscripten, Python and uv. Dependencies are pinned by `bun.lock`.

```sh
bun install --frozen-lockfile
make web
python3 -m http.server 8620 --directory web/dist
node tests/three/verify.cjs http://localhost:8620/
clang -std=c11 -Isrc tests/test_three.c src/tower.c src/game.c src/twr.c src/sound_hook.c -lm -o /tmp/test-three
/tmp/test-three
```

The verification command uses the installed ordinary Chrome through `agent-browser` in its own headless session. It exercises construction, non-mutating full-span preview, all four style swaps, rent/inspection, finance, zoom anchor, capture, IndexedDB persistence and a 390×844 DPR-3 viewport. Output evidence is written under `/tmp`. The service worker precaches a build-generated file manifest, including the bundled Three module, audio and full-resolution crops; no CDN is required at runtime.

## Asset provenance

`tools/prepare_web_art.py` deterministically crops the existing `data/styles/*/sources/` plates. It does not generate or upscale images. The crop manifests record the source hashes and bounds. The only alpha processing follows the existing pack pipeline: connected white edge background is removed while enclosed details remain. Existing source provenance and its historical model/cost records remain untouched.

Production distribution combines this default game with the landing page in the site integration pipeline. The engine repository builds an artifact; it does not deploy a separate competing game site. The browser now requires WebGL2. Source poses now share a registered foot baseline and world body box; painted detail still limits fidelity; a scene uses flat illustrated interiors with shallow geometric structure, not a fully modeled freely navigable 3D tower. Construction remains on the original tower grid.

Actor root causes, source registration, queue semantics and visual cases are documented in [three-actors.md](three-actors.md).

## Previous migration evidence

The integrated browser check passed 21 assertions covering campaign/sandbox tool
availability, empty-tower save/reload, full-span preview, placement, rent, all four style changes, anchored
zoom, Three PNG capture, financial panels, IndexedDB saving and a DPR-3 phone
viewport. Manual browser passes also exercised elevator schedules/cars/Simulate,
names/finding, tuning, fire and bomb decisions, star notice acknowledgement,
Web Audio signal/loop start-stop/mute, original-format export/import and offline
reload plus style switching. Offline assets are precached from a generated
manifest. A mobile viewport emulation is evidence of layout, not a physical
iPhone performance test.

The native simulation suite has four existing failures in the 24-shaft fixture;
the same four failures reproduce using the untouched base `8026387` tower source.
It also needs `-include stddef.h` with Apple Clang because its existing test file
uses `offsetof` without that include. No new failure was observed in that suite.
