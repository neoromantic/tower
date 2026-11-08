# Modern pixel source asset package

Ready for the packer. Five original generated PNG sheets, each **1536×1024**, produced with **openai/gpt-image-2.6-flare** through the authorized AI Gateway images/generations API. No original game sprite image was supplied. Full exact prompts, requests, sanitized responses, routing metadata, IDs, SHA256 and normalization details are in `provenance.json`.

| File | Grid | Cell size | Row-major contents |
|---|---|---|---|
| rooms.png | 2×8 | 768×128 | office, condo, hotel, shop, fast-food, restaurant, medical, security, housekeeping, party hall, cinema, metro, lobby, parking, recycling, elevator machinery |
| people.png | 6×4 | 256×256 | six frames each: business pedestrian, casual resident, maid, formal VIP/wedding guest |
| transport.png | 4×4 | 384×256 | lift closed, lift opening partly occupied, lift open full, express lift, engine, shaft, stairs up/down, escalators up/down, train, car, ramp, service vehicle, helicopter, crane |
| exterior-effects.png | 4×4 | 384×256 | clear/dusk/night skies, clouds, skyline, floor/ceiling, ground/roof, three flame poses, cathedral exterior, ceremony, wedding arch, medical emblem, warning, star |
| ui.png | 4×4 | 384×256 | office, home, hotel, shop, dining, medical, security, housekeeping, hall, cinema, metro, lobby, parking, recycling, elevator, stairs |

## Inspection and one correction pass

All five sheets were visually inspected. Rooms initially had uneven generated row heights; observed row bands were registered to exact 128px rows using nearest-neighbor resampling. Exterior received one targeted Flare regeneration for the incorrect dark cutout backdrop. The regenerated gray backdrop was normalized to white by edge-connected desaturated-color extraction, and its observed row bands registered to exact 256px. Final rooms/exterior were visually reviewed. No other regeneration was performed. Original response hashes and final file hashes are retained. No packing, builds, commits, pushes, engine or tools changes were made.

## Production limitations

- Generated pixel art retains some soft tonal shading inside pixel clusters; it is not a hand-indexed fixed palette atlas.
- People remain wholly within 256x256 cells, with slight scale/baseline drift and similar repeated poses; six frames per character are not hand-authored locomotion. Fourth row is one formal VIP/wedding character, not separate emergency and bride archetypes.
- Incidental parking P glyphs exist in transport/UI despite the no-text prompt; icon semantics otherwise match.
- White cutout sheets are RGB, not native transparent PNG. White interiors need preservation by the packer; global white-to-alpha removes light costume/cloud details.
- Exterior background normalization may erase connected pale details; the cloud is primarily a white silhouette with navy outline. Cathedral ceremony is a full-scene cell, not a character cutout.
- Rooms contain some baked-in figures and nonuniform furniture scale; original row heights were normalized to exact 128px by nearest neighbor. Room wall/floor strokes are artwork, not atlas gutters.
- Engine-size packing, animation playback, silhouette legibility at actual game resolution and integrated gameplay remain unverified by this source-only worker.

Validation: final dimensions and SHA256 for all five files match provenance; every response reports the exact requested Flare canonical model and successful OpenAI routing. Base64 payloads and credentials are absent from provenance. Integration owner must run the assigned single integrated smoke after packing.
