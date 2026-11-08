# Miniature 3D source asset package

Five newly generated PNG source sheets, 1536×1024 each, using `openai/gpt-image-2.6-flare` through the authorized Images API. No original sprites or reference images were supplied. Exact prompts, requests, sanitized response metadata, routing, generation IDs, dimensions and SHA256 hashes are in `provenance.json`. Seven successful generations total: five originals plus one correction pass on rooms and transport. Replaced generation metadata is retained; replaced PNG variants are not shipped.

| File | Intended grid | Intended cell | Contents |
| --- | --- | --- | --- |
| rooms.png | 2×8 | 768×128 | Office, condo, hotel, shop, fast food, restaurant, medical, security, housekeeping, hall, cinema, metro, lobby, parking, recycling, machinery |
| people.png | 6×4 | 256×256 | Six poses each: business pedestrian, casual resident, maid, formal VIP/wedding guest |
| transport.png | 4×4 | 384×256 | Four lifts; machinery, shaft, two stairs, two escalators, train, car, ramp, service vehicle, helicopter, crane |
| exterior-effects.png | 4×4 | 384×256 | Three skies, clouds, skyline, floor/ceiling strip, ground/roof trim, three flames, cathedral day/ceremony, wedding decoration, medical emblem, warning, star |
| ui.png | 4×4 | 384×256 | All 16 requested building-group icons |

## Visual inspection and correction

All five sheets personally inspected. Clay forms, matte surfaces, pastel blue/sage/coral palette and readable silhouettes are coherent across categories. One correction pass targeted room geometry and lift occupancy. Corrected lift cells show two and five passengers. Transport has genuine alpha: 755,711 pixels fully transparent; alpha range 0–254. The viewer exposes gray RGB beneath transparent pixels; preserve source alpha when packing. Other sheets are opaque white-backed images except sky and room art.

## Production limitations

**Room grid remains approximate, not pixel-exact.** All sixteen rooms exist in correct order, but row heights drift. Observed floor boundaries are roughly y=0,144,284,416,545,678,796,906,1024, rather than multiples of 128. Column division is near x=768. Strict equal-grid slicing can pick up adjacent room edges. The correction improved separation and removed visible parking lettering but did not solve exact geometry. No further generation attempted under the one-correction limit.

People have small scale/baseline shifts and repeated poses; animation is not guaranteed seamless. The fourth row supplies a formal guest, not three separate VIP/emergency/wedding identities. Transport contains some angled depth in ramps/escalators. Sky cells have thin white margins; flame animation has shape/registration drift. Skyline reads as a distant miniature castle city. Icons have minor scale and centering variation. Small diegetic marks may survive at source resolution.

All five exact filenames are available to the packer, covering 88 intended cells. **Source handoff is ready with the stated framing limitation; pixel-perfect production readiness is not claimed.** Exact cropping, resizing, palette/transparency conversion and game smoke verification remain with the packer/controller. No packer, engine, web shell, build, commit, push or deploy changes were made by this worker.
