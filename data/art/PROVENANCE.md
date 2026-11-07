# Original gameplay artwork

`interiors.png` is an original image generated for this project with the built-in
OpenAI `image_gen` tool on 2026-11-08. The exact prompt is in `PROMPT.txt`.
The tool exposes no model selector or model identity, so the requested optional
`gpt-image-2.6-flare` model could not be selected or verified. No existing game
artwork or reference images were supplied. The generated output is bundled here;
generation is not needed to build or play the game.

The atlas has two columns and eight rows: office, apartment, hotel, shop, fast
food, restaurant, clinic, security, laundry, celebration hall, cinema, metro,
lobby, parking, recycling, elevator machinery. These pixels are used in gameplay
rooms, lobbies, machinery and toolbar icons, rather than only in promotional art.

`tools/generate_resources.py` deterministically crops and resizes that source and
adds original schematic figures, transport, exteriors and interface artwork.
`sheets.json` and `ui.json` are self-authored resource layout metadata. Frame
widths, floor heights and tenant heights are read from the C renderer and tower
header. No executable, extracted bitmap, palette, sound or proprietary reference
is an input. Resource IDs and crop geometry are compatibility identifiers for the
existing renderer, not copied creative content.

The shared 256-entry palette is authored in the generator. White is exactly
RGB(255,255,255); portrait keys are (230,230,230), digit keys (25,25,25), skyline
keys (138,212,255), and cathedral keys (74,180,255). Indices 197-203 are reserved
for the engine/security/cinema palette-cycle lamps. DIBs are bottom-up 8-bit
rasters with local palettes; CGPK resources retain 8x36 column packing.

Run from the repository root:

```sh
uv run --with pillow==12.0.0 python tools/generate_resources.py
```

This imports original `SOUNDS` and `TEXTS` from `tools/sound_resources.py` (see
`data/RESOURCE-AUDIO.md`) and writes the resource-only MZ/NE container
`data/tower.dat` and `contact-sheet.png`. There is no executable
code in the container. Outputs were verified deterministic with Python 3.13.2
and Pillow 12.0.0; other Pillow versions may change quantization/font rendering.
Contact-sheet labels are hexadecimal resource IDs and native dimensions, not
game content.

The generated art deliberately uses a simple schematic style with a limited
palette. It does not reproduce the original game's appearance. Different room
states share the original generated base, with lighting and occupancy marks;
styles share their theme artwork. Palette animation, frame counts and source
rectangles remain available to the existing renderer.
