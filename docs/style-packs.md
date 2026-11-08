# Gameplay style packs

The resource generator accepts `--style schematic`, `--style modern-pixel`,
`--style warm-dollhouse`, or `--style miniature-3d`:

```sh
uv run --with pillow==12.0.0 python tools/generate_resources.py --style schematic
```

Each choice reads all five thematic plates from `data/styles/STYLE/sources/`
and writes `tower.dat`, `coverage.json` and `contact-sheet.png` beside that
folder. Generation is offline; Pillow 12.0.0 fixes resampling, quantization and
font rendering. The no-argument command still generates the original standalone
`data/tower.dat` and `data/art/contact-sheet.png`.

The five source PNGs are original Flare generations. Each source folder contains
exact prompts, sanitized requests/responses, routing/model identity, generation
IDs and SHA256 hashes in `provenance.json`, plus the source owner's visual review
in `report.md`. Packing never invokes an image model. It does not read or sample
another game's graphics.

## Resource contract

Every pack has the same 222 bitmap IDs, native dimensions, DIB/raw types and
composite boundaries as the baseline. DIBs retain bottom-up aligned rows and a
local 256-color palette; raw CGPKs retain top-down 8×36 column ordering. All
52 synthesized SOUNDS and 27 TEXTS are shared unchanged. The pack is a
resource-only MZ/NE container, not executable game code.

`coverage.json` lists every ID, dimensions, raw flag, source cells, crop or frame
state mapping, source file SHA256 and output SHA256. `source_crops` gives exact
plate rectangles in row-major order; subsequent bounds trimming refers to alpha
bounds inside those cells. Coverage is asserted complete during generation.

| Plate | Layout | Packing |
| --- | --- | --- |
| rooms | 2×8 | Office, condo, hotel, shop, fast food, restaurant, medical, security, housekeeping, hall, cinema, metro, lobby, parking, recycling, machinery. Existing frame/piece/row metadata slices the new room art. Dark/occupancy variants are deterministic. |
| people | 6×4 | Six sequential generated poses of business, resident, maid and formal characters. Native strips cycle those poses; portraits, queues and wedding/emergency strips retain their native widths. |
| transport | 4×4 | Closed/partial/full/express lifts, engine, shaft, stairs up/down, escalators up/down, train, car, ramp, service vehicle, helicopter and crane. Lift strips combine source car states with generated passenger figures. Stair animation places sequential generated walkers on the diagonal before native splitting. Metro adds the generated train to its room composite. |
| exterior-effects | 4×4 | Day/dusk/night, cloud, skyline, floor/ceiling, ground/roof, three flames, cathedral, ceremony, wedding arch, medical mark, warning and star. Cathedral scenes are sliced vertically; day/night halves stay paired. Four flame resources cycle three generated poses. |
| ui | 4×4 | Sixteen building-group icons mapped into the engine's exact 26 toolbar slots, with generated floor/cathedral overrides. Deterministic labels, borders, clock and dialog/control geometry sit on new thematic room-color surfaces. Selected controls are darkened. |

All final bitmaps derive from the new thematic plates. The baseline procedural
art defines the existing geometry in the same generator; themed generation
replaces its non-room pixels before encoding. No missing category substitutes
baseline artwork. Digits combine generated shaft plaques with deterministic text.
Tiny marks, UI typography, occupancy marks, brightness states and reserved cycle
lamps are deterministic additions, not separately generated images.

## Palette and transparency

Nineteen authored semantic colors keep the existing key contract. The palette
adds 171 colors quantized from all five thematic plates. Indices 197–203 retain
the existing lamp colors and are explicitly stamped into the engine, security
and cinema resources after quantization.

Opaque cutouts lose only edge-connected near-white backgrounds. Existing native
alpha is preserved. Alpha is resized with the artwork, thresholded at 128 and
restored to its exact reserved palette index after quantization. Opaque artwork
is remapped away from its key index first, preserving enclosed white costumes.
Portrait grounds are RGB(230,230,230), digit grounds RGB(25,25,25), skyline
RGB(138,212,255), cathedral RGB(74,180,255); other cutouts use white or the
existing shaft ground. This preserves renderer color-key behavior.

## Source limitations and validation boundary

These are stylized raster packs at legacy dimensions, often only 8–16 pixels
wide for people and 24 pixels tall for rooms. Fine details and subtle shading
necessarily disappear. Sources have similar/repeated poses and slight
registration drift; six-pose cycling is not bespoke animation for every native
frame. Emergency and wedding figures share the formal character, and the three
lift illustrations plus deterministic passengers synthesize five fullness
states. These limitations are visible in source reports and contact sheets.

Miniature room boundaries are explicitly cropped at source y=0,144,284,416,545,
678,796,906,1024 rather than blindly cutting the approximate generated rows.
Schematic and modern-pixel source owners already normalized their room grids.
Warm-dollhouse must be packed from its corrected 2×8 room sheet and cleaned
exterior source. The initially incomplete seven-row source must not be used
for the final pack; source hashes in coverage identify the exact consumed
revision.

Targeted pack verification compares all IDs, types and dimensions against the
baseline, checks shared audio/text, raw ordering, reserved keys/lamps, source
coverage and byte-for-byte repeated generation. Contact sheets are visual
packing evidence. In-game style switching, mobile display, PWA behavior and
production deployment are verified separately by the integration owner.

Completed pack checks: schematic, modern-pixel and miniature-3d preserve all
222 bitmap IDs/types/dimensions, raw ordering, shared audio/text and reserved
keys/lamps. Repeated generation produces identical pack, coverage and contact
sheet bytes. The source correction and final warm-dollhouse packaging remain
with the correction/integration owner. No game build is part of this check.
