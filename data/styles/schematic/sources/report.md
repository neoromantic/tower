# Schematic source package

Ready for packing: five PNG sheets, each exactly **1536 × 1024**, all new original art generated with **openai/gpt-image-2.6-flare** through the authorized Vercel AI Gateway `/v1/images/generations` endpoint. No original game sprites or comparison scenes used as image inputs. Source scope only; no packer, engine, build or deployment changes.

| File | Columns × rows | Exact cell size | Coverage |
| --- | --- | --- | --- |
| rooms.png | 2 × 8 | 768 × 128 | office, condo, hotel, shop, fast-food, restaurant, medical, security, housekeeping, party hall, cinema, metro, lobby, parking, recycling, elevator machinery |
| people.png | 6 × 4 | 256 × 256 | six poses each: business pedestrian, resident, maid, formal VIP/wedding guest |
| transport.png | 4 × 4 | 384 × 256 | three lift occupancies, express lift, engine, shaft, stairs up/down, escalators up/down, metro, car, ramp, service vehicle, helicopter, crane |
| exterior-effects.png | 4 × 4 | 384 × 256 | day/dusk/night skies, clouds, skyline, floor strip, roof/ground trim, three flames, cathedral exterior, ceremony, wedding arch, medical cross, warning, star |
| ui.png | 4 × 4 | 384 × 256 | office, home, hotel, shop, dining, medical, security, housekeeping, hall, cinema, metro, lobby, parking, recycling, elevator, stairs |

All ordering is row-major. Flat cream/navy/teal/coral schematic geometry, side camera, hard outlines and distinguishable functional silhouettes are consistent across the package. All five sheets were personally visually inspected.

## Grid correction and provenance

Initial room generation had unequal row heights. One targeted room regeneration retained that fault. Deterministic per-cell ImageMagick cropping/resizing then registered the generated room pixels to the exact required grid. The same operation removed unwanted thin generated grid separators from transport and exterior sheets. Final normalized sheets were visually inspected; objects stay within their cells. Do not inset them again merely to remove the original dividers.

`provenance.json` records every exact prompt and request, sanitized full response metadata, provider routing, generation IDs, selected response headers, dimensions and final SHA256. Normalized sheets additionally record generated-image SHA256 and every crop rectangle in row-major order. The discarded initial room attempt retains its request/response and hash as a superseded record; its PNG is not shipped. No base64 image payloads or authorization credentials are recorded. Six API generations total, one model only.

## Production limitations

- Cutouts are opaque white, requiring the packer's background-to-alpha conversion; near-white antialias fringes may remain.
- Some subtle tonal shading remains despite the flat-fill prompt. These are raster illustrations, not mathematically flat vector primitives.
- People preserve coherent characters, but have small registration drift and repeated walk silhouettes. Fourth row is one formal VIP/wedding guest reused for emergency occupants, not a separate paramedic or bride.
- One incidental parking `P` glyph appears within the parking room despite the no-text instruction. No atlas labels or captions appear.
- Room normalization trims ceiling/floor edges to retain furniture within exact cells; engine floor structure must frame the sprites.
- No engine/packed-resource verification performed here. Integration must check small-scale readability, alpha conversion, animation timing and complete resource mapping. This source package does not establish that every runtime state has already been packed.
