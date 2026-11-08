# Current SDL HD world renderer

The world keeps its 8 × 36 grid and 24-unit room interior. Logical sprite sizes,
frame indices, Tower/GameSim, saves, IDBFS, audio and text resources remain in
place. This is the current SDL renderer; it does not migrate to Three.

`uv run --with pillow python tools/hires_resources.py` derives all four packs from
existing source plates and recorded crops. It never reads NE bitmap pixels.
Room frames use aspect-preserving cover, clipped to their native footprint;
objects use contain. People share a scale across their six poses and register
at bottom center. Warm dollhouse reads each original normalization crop's own
source, including the separately generated recycling room, without the old
anisotropic room normalization. Sources and historical provenance are unchanged.

The HD budget is four physical pixels per logical unit: a 72 × 24 office uses
288 × 96 real source-derived pixels, instead of enlarging a 72 × 24 NE bitmap.
Original source plates remain available; these runtime derivatives deliberately
trade some source detail for a mobile memory budget. Full frame/state strips
are authored before splitting. Repeated 64 × 36 logical tiles share physical
pixels. Pages are at most 2048 × 2048, with replicated one-pixel gutters for
linear filtering. Even the 92-frame tall-stair sheet never becomes an oversized
GPU texture. Metadata composes rooms, stairs, cathedral, metro and other multipart
objects without downsampling/readback. Cloud sheets retain four complete time/weather rows so source selection never clips a single cloud into quarters. Sky fills through the ground baseline behind transparent skyline art.
Palette-cycle derivatives use source-art
brightness changes and retain the existing frame IDs.

`hd/world.gz` contains little-endian uint32 page count, sprite count and scale;
then each page's uint32 width/height and RGBA bytes; then sprite ID, region count,
and seven int32 values per region (logical x/y/w/h, page, physical x/y).
`Sprite.w/h` remain logical. `sprites_copy` intersects logical source rectangles
with regions and scales only the source coordinates to physical texels. Destination
geometry is unchanged. It preserves the legacy texture's color/alpha modulation.
Every current `SPR_*` world ID has HD regions; only the toolbar, clock and legacy
dialog constants retain NE pixels.

HD pages load **after** legacy palette/key/composite/UI-cache setup. Those legacy
readbacks cannot shrink or recolor HD pages. Only the active style has GPU pages;
hot switching releases them and leaves simulation state in place. Missing HD
startup data is an explicit failure. Re-selecting the loaded style returns
immediately, avoiding a second startup decode/upload.

Makefile uses Emscripten preload files for style packs, producing `index.data`.
The shell/service worker must distribute and precache that file alongside
`index.js`/`index.wasm`. Packs are already compressed; embedding them as base64
JavaScript would add parser/string memory. GPU bytes, compressed bytes, source
hashes and bundle hashes are recorded per style in `hd/provenance.json`.
A page surface exists only during its upload; the loader does not inflate the
whole RGBA bundle at once. Four compressed packs remain in MEMFS for offline
hot switching.

## Performance and verification scope

Source inspection identified repeated `TTF_RenderUTF8_Blended` / texture creation
and destruction in common text drawing, floor labels and shaft labels, plus an
unconditional 16 ms wait **after** frame work. A bounded 128-entry text texture
cache now reuses identical font/text/color requests. Frame pacing subtracts
actual work from the existing 60 Hz target. Simulation tick rules are unchanged
(normal every fourth frame, fast every frame); very slow rendering still slows
the simulation. This change does not rewrite simulation timing.

`ct_render_stats()` supplies observed CPU submission `renderMs`, cumulative
`renderMeanMs`, `renderMaxMs`, completed-loop `frameMs`, frame count, cumulative
cached-text `textUploads` and active `hdBytes`. GPU completion is not measured.
The first frame includes cold text uploads; compare a bounded warm interval's
counter deltas. Legacy dialog-specific direct TTF calls still exist.

Worker checks are compile-only for the changed C sources, binary page/region
bounds and complete world-ID coverage. No integrated build/deploy or physical
phone FPS claim is made here. The controller owns the single integrated build,
RAF/heap/render timing sample, same-tower four-style screenshots and focused
mobile acceptance. Existing functional PWA evidence does not establish the new
HD/touch visual result.
