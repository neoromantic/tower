# Warm dollhouse source asset report

Status: **source contract corrected, ready for packing review**. All sixteen room categories are present in exact 2×8 cells of 768×128; exterior/effects retains exact 4×4 cells of 384×256. All five production sheets remain 1536×1024. Final sprite/game readiness belongs to the pack owner.

The original rooms sheet had seven bands and only fifteen actual rooms, not eight correct rows. Its exact original bytes are retained in `rooms.generated.png`. Observed bands `[0,154,302,446,591,732,876,1024]` supplied the first twelve rooms and lobby. The final right half was split at x=1150 into parking (index 13) and elevator machinery (index 15). Every observed crop was independently resized using LANCZOS to 768×128, preventing cross-row crops.

The missing recycling room is real new generated artwork, saved separately as `recycling-room.generated.png`: bins, baler and sorting bench. Exactly one supplemental request completed through the previously authorized `openai/gpt-image-2.6-flare` Images API route, after verifying that exact model in Gateway's model catalogue. Generation ID: `gen_01M6W9KK45WD98B278YBFM1EJC`. The actual room bounds `[0,0,1536,824]` were cropped and resized into index 14. Lower empty floor was omitted; the furnishings are retained. No full-sheet regeneration was performed.

That request completed **before the subsequent prohibition on Gateway image generation**. No requests were active at prohibition; none needed cancellation; no further API calls were issued. Gateway is now prohibited except Jev. Recorded costs are historical only: exact request/response routing, cost, prompt and headers are in `provenance.json`.

`exterior-effects.generated.png` preserves the original gradient-backed sheet. The final file changes alpha only; RGB is identical to the original everywhere. Sky cells 0–2 are untouched full tiles. Other cells use observed polygons, deterministic GrabCut or bright flame pigment extraction. Subject interiors are retained rather than globally color-keyed: cloud bodies, cream medical disk, warning/star centers, complete wall/trim tiles and wedding arch interior remain actual source art. Exact per-cell bounds, anchors, thresholds and methods are recorded in `normalization.json`; `normalize.py` reproduces the correction with Pillow/numpy/scipy/OpenCV. No generation was used for cleanup.

Personally inspected `rooms.contact.png` and `exterior-effects.contact.png`. All sixteen rooms are recognizable, contained and correctly ordered. Final checks confirm every room cell equals its recorded crop/resize, both sheets have exact dimensions, exterior RGB is unchanged, and three sky cells are opaque and pixel-identical.

Remaining limitations:

- Parking/machinery are horizontally stretched from narrow original cells; recycling is vertically compressed and has denser detail than the other rooms.
- Exterior alpha is binary. Some coarse edges, color fringes and small background wedges around the ceremony architecture remain; soft flame glow was removed. The arch retains its original cream interior backdrop. Wall/trim cells include full wall context.
- People, transport and UI were untouched by this correction. Their prior limitations remain: approximate animation registration, some near-duplicate poses, and the partially occupied lift lacks visible occupancy.
- Pictorial menu markings remain in the fast-food room. Readability at final sprite scale and animation alignment need packing/game review.

`provenance.json` retains original prompts, safe request/response metadata, exact model routing/generation IDs and original/final hashes; `normalization.json` records every crop/cutout and evidence hash. No secrets or base64 payloads are recorded. No engine/tools/build/browser/commit/push work was performed.
