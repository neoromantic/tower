# Three primary browser contract

Implementation contract for the C, renderer and shell owners. The C source implements the plan and snapshot fields below; integrated runtime acceptance remains pending. Keep one running simulation, four live styles, saves/IDBFS, audio, native SDL and existing credits/licenses. No new economy, image generation, renderer replacement or save-layout change.

## Office tenancy and daily presence

Authoritative current sources: `Tenant` in `src/tower.h`, `TenantState` and capacity constants in `src/game.h`, `update_tenants`, `game_judge_daily`, `game_stressed_moveout`, `game_set_rent_class`, `game_relet_arrivals` in `src/game.c`, and `people_office_workers` / `people_office_lit` in `src/people.c`.

| Current office state | Tenancy meaning | Presentation |
| --- | --- | --- |
| `TENANT_EMPTY` (0), `TENANT_CONSTRUCTION` (1) | Not leased yet; construction pending/running | Construction, no vacancy sign over scaffolding |
| `TENANT_MOVING_IN` (2) | Awaiting initial occupation; unreachable units remain here | Available / awaiting access |
| `TENANT_OCCUPIED` (3) | Leased | Furnished office; daily people/light signal remains separate |
| `TENANT_CLOSING` (4), `TENANT_VACANT` (5) | Leased, closing/closed for the inactive period | Furnished, possibly dark; never a vacancy sign |
| `TENANT_ABANDONED` (7) | Actual loss of tenant, eligible for existing re-let mechanics | Vacant; `burned` separately selects rubble |

State 6 is retired and is not a new tenancy category. The existing `rooms[].occupied` expression includes states 3–6, excludes 7, and already keeps overnight state 5 occupied. Do not infer leasing from `capacity`, `population`, the number of decorative occupants, time of day or `lit`. `capacity` is an animation byte, `cap_peak` its persistent tier, and office population is not a live head count at desks. `demand_armed` is the market/mover gate, `demand_category` the judge verdict, and banked pool stress feeds that verdict. Preserve those mechanics.

Minimal room snapshot delta in `ct_world_state()`:

```text
rooms[].workers: integer       // offices only: people_office_workers(tower, tenant), 0..6
```

Reuse `id,type,state,occupied,lit,construction,burned,rent,evaluation,demand,population`; no extra `leased`, `vacant` or `nightEmpty` flags. Existing `lit` remains `people_office_lit`, not `workers > 0` (a weekday office can await arrivals with its lights on). The renderer must suppress occupied-office figures and populated art when the office is genuinely unlet, and use workers for daily office presence, not the decorative `TenantOccupants.count`. The shell's inspector continues to use C's native status and rent controls.

Controlled transition demonstration for the implementation owner, using the port alone:

1. Build a reachable office with existing construction and transport. Observe 1 → 2 → 3; record its stable tenant ID and snapshot. Let the normal workday drain into state 5: `occupied` stays true while workers drop to zero and light follows the native idle sentinel. No vacancy sign appears.
2. In a targeted C fixture, use default tuning, `star_rating=1`, `rent_class=1`, `pool_stress_total=200`, `pool_stress_trips=1`, no noisy neighbor and no content same-type floor-mate to pair. The native metric is 200, above the 150 stress bar, so the judge returns category 0. Invoke `game_judge_daily` followed by the existing third-day `game_stressed_moveout` boundary. Assert state 7, capacity/population zero and demand disarmed. Do not implement a new eviction switch or use an original executable.
3. Change the rate through existing `game_set_rent_class` / browser `ct_ui_action("rent", 3, "")` for the selected office. Class 3 forces the fixture metric to 0, yielding category 2. Demand re-arms while state remains 7. Advance normal mover travel on a reachable route, then `game_relet_arrivals`: state 3, capacity initialized, stress reset and the existing re-let payment retained. Separately retain the native content-neighbor pairing case; it can re-arm immediately at move-out.

A focused source fixture covers construction/move-in, overnight closure, the controlled stressed move-out, rent-control rescue and real mover re-let. The focused runtime fixture passed construction, closure, abandonment and native re-let. No new revenue, automatic lease probability, tenancy timer or forced move-in action is authorized.

## One forgiving construction plan

Corrected mismatch: the former preview rejected the whole gesture after any failed stamp, returned an enclosing rectangle, and confirmation rebuilt a different plan through `drag_place_units` or a single `tower_place`. The world command now retains accepted ordered operations, checks their native prices and final geometry on a fresh trial, then executes those same operations. `docs/touch-ui.md` describes the older CSS-pixel `ct_preview`/`ct_place` boundary; Three uses integer grid coordinates through `ct_world_command`. Keep these two coordinate domains explicit.

Use the existing export and actions; no new export or shell-side legality/pricing:

```text
ct_world_command(action, floor, cell, endFloor, endCell) -> 0 | 1
  "preview"       replace pending C-owned plan; return 1 when request handled
  "place"         validate and commit the stored plan once
  "drag"          same stored-plan confirmation semantics as "place"
  "preview-clear" discard pending plan and ghost
```

`place`/`drag` arguments must match the stored normalized gesture and current tool. They never rebuild a different plan at confirmation. Tool change, Cancel, load/new tower and successful commit clear it. No pending plan means no construction. Existing inspect/delete/shaft controls retain their separate actions; an immediate shaft-cap gesture must not masquerade as a confirmed build preview.

### Candidate order and native constraints

- Snap pointer positions to the existing 8-unit cell / 36-unit floor grid. Clamp imprecise endpoints to the lot/storage bounds before planning. Ordinary horizontal drags lock the starting row; vertical pointer drift does not build another row. Use the current centered `build_origin_cell` for both endpoint origins; the floor tool uses raw cells. Sort horizontal origins left to right, giving the same selection for a reversed drag on the same row. A tap tries its centered stamp only.
- For ordinary room drags, scan every cell origin between those endpoints. On success append that native placement and advance by the room width; on rejection advance one cell and continue. This finds complete free spans after an occupied/unsupported start, between existing rooms and at a supported floor edge. Never shrink rooms, replace tenants or place partial footprints. An invalid candidate does not invalidate accepted candidates.
- Use a trial copy of the current Tower with `tower_preview` and `tower_preview_place`; use `tower_extend_deck` for floor candidates. Only successful candidates alter the trial. Preserve native item/deck charges, funds, unlocks, support, limits, overlays and automatic gap fill. Ground remains lobby-only; basement support follows the floor above. Do not copy native legality into JS.
- Floor drags scan cells left to right, preserving existing cells and recording only new deck. Native deck extension unions with the existing extent: if reaching a candidate would also fill an unsupported gap, reject that candidate. Do not create floating disconnected spans to bypass this rule. Room placement's automatic deck/gap additions must also be included in the visible plan and total price.
- Lobby drags retain the native contiguous union, per-cell/band charge, shaft coexistence, sky-lobby levels and chosen grand-lobby height. Validate the entire resulting union against existing tenants, including the gap to an existing lobby: preserve occupied rooms. Skip an extension that would overwrite one. Exact new lobby/deck rectangles include automatic upper mirrors; existing lobby area is not presented as a new purchase. Do not lock a previously unchosen height during preview or failed confirmation.
- Stairs/escalators use the clicked upper landing (`build_origin_floor`) and `tower_stair_rise`, including grand-lobby promotion. Preserve native landing support, escalator landing whitelist, construction gates and half-tile/shaft clearance. Ordinary room overlap rules must not forbid legal transport overlays.
- Elevators keep one snapped column and scan from the starting floor toward the endpoint, one floor at a time. Already existing same-type segments are kept and uncharged. Apply native extension/start/clearance/span/group rules to new segments. A rejected extension must not create a detached new shaft beyond the break; continue scanning only within the same connected intended run. A gesture wholly inside an existing shaft, with no requested new segments, becomes one add-car operation only when `elev_can_add_car_at` allows it. A failed extension never silently buys a car. Retain native car price, capacity and car-count limit.

### Money, exact preview and confirmation

Use sequential native affordability against the trial's remaining money. Skip an unaffordable candidate, retain all accepted candidates and continue scanning; a later cheaper or zero-cost legal extension may fit. Never increase trial funds, borrow, reduce prices or hide an unaffordable tail. This is a deterministic affordable subset, not a promise to build the entire gesture. If nothing fits, `valid=false`, `count=0`, `cost=0`; if anything fits, enable Place for exactly that subset and show skipped/funds reasons beside its price.

Keep the existing `ghost.active,type,valid,count,cost,reason`. Add only:

```text
 ghost.operation: "build" | "add-car"
 ghost.rects: [{type, x, floor, width, height}]
 ghost.skipped: [{x, floor, reason}]
```

Rectangles use cells/floors, with lower-floor anchors and half-open extents. `rects` is the exact set of new room/transport footprints and newly added/converted deck/lobby areas, including native side effects. Do not include existing rooms or an enclosing box spanning skipped space. Adjacent deck rectangles may be merged. Overlapping item/deck layers are distinguished by `type`; a room footprint may replace bare floor without replacing an existing room. `count` counts accepted native operations, not rectangles; `cost` is the trial's actual money delta, not catalog cost times count. `reason` is a concise C-owned summary; `skipped` preserves each rejected origin's native reason (record it before another native check clears it). A no-op existing segment/deck is neither a new operation nor a blocked candidate. For add-car, `rects=[]`, `count=1`, and the renderer highlights the existing shaft from the stored gesture/shaft snapshot. Retire use of enclosing ghost geometry for rendering; gesture endpoint fields may remain for the existing caller.

C retains ordered operations and their prices internally; rectangles are presentation output, not a second JS build request. On Place, recheck current tool/unlock/modal/event gates and replay the *stored operations* on a fresh trial, checking identical footprint effects and total cost plus current funds. If any operation is no longer legal or would produce a different plan, return 0 with zero live changes and a C-owned reason; require an adjusted/refreshed preview. Do not silently drop another candidate or add a newly affordable one. When validation succeeds, execute the same ordered native operations synchronously, consuming real placement RNG only then, followed by the existing build notification/audio/metro hooks once. Do not install the trial Tower as the live result: cinema initialization intentionally omits RNG in preview.

Preview and Cancel consume no RNG and change no live Tower, money, style rotation, people, lobby choice or save state. Use the existing preview placement path; do not preview by real placement and rollback. Native SDL placement remains intact.

## Actor snapshot and world registration

Keep `ct_world_state` as the single source. Existing `people` already supplies IDs, positions, dimensions, frames, kind/state/VIP and queue stress; `cabins` already supplies occupancy/capacity, doors, target and movement timers; `shafts` supplies column, extent and hidden state. Do not create a second actor model or duplicate those values under new names.

Small queue delta:

```text
queues: [{shaft, floor, direction, count, maxCount, waitFrames}]
  shaft: existing shafts[].id
  floor: signed semantic floor, never internal floor-array index
  direction: 1 up, -1 down
  count: ElevatorStop.up_count / down_count, including clipped people
  maxCount: QUEUE_CAP (40 per direction); capacity, not historical peak
  waitFrames: maximum (sim.frame - Person.wait_start) in that ring, 0 if empty

people[] where kind == "queue": add {shaft, direction, order}
  order: zero-based current ring position, before visual clipping
```

Emit queue summaries for both directions of each active stop, including empty queues, independent of `animation.people`; suppress person meshes when that option is off. Reuse `queue_line_limits` for visible queue geometry: up stands left, down right, spacing and floor/neighbor clipping remain authoritative. Count/maxCount must never be inferred from visible sprites. `waitFrames` is current queue elapsed time in simulation frames, not seconds or accumulated stress; existing per-person `stress` remains banked wait plus live wait, with native staff tint exemption and native thresholds. No new historical maximum counter. The shell may show count/maxCount, direction and wait, and the renderer can show a compact overflow count without inventing off-floor people.

Passenger visibility requires no extra passenger list: existing `cabins[].occupancy` comes from `ElevatorCar.passengers`, `capacity` from its shaft, and real identities remain in `car.pax` / the existing native rider inspector. Draw the loaded cabin/interior when occupancy is positive, visibly empty when zero; any individual silhouette count is bounded by occupancy and interior room. Preserve cars and queues when `shaft.hidden` makes the shaft body transparent. People-off hides silhouettes while retaining car movement/doors and authoritative counts. No invented boarding or randomly spawning passengers. If individual rider selection is later requested, that is a separate delta; do not duplicate `pax` now.

Registration for all four styles:

- World units are the existing source units: 1 cell = 8, 1 floor = 36. Camera zoom, viewport size, device pixel ratio and bitmap resolution never change entity dimensions. `rooms`/`ghost.rects`/`shafts` use grid units; `people`/`cabins`/`effects` x/y/width/height use world units.
- A room at `(x,floor,width,height)` occupies `[8*x,8*(x+width))` horizontally and `[36*(floor-1),36*(floor+height-1))` vertically. Center is `(8*x+4*width,36*(floor+height/2-1))`. Use this same lower-floor anchor for art, selection, preview and multi-floor hit tests. C's `Tenant.floor` is the lower floor, including metro, venues and promoted stairs; do not recenter to the top floor or clicked landing.
- Actor x/y is the lower-left registration box; feet stay at y, center at x+width/2. People retain a consistent 16-by-24 visible body registration across occupant/queue/walking/cleaner art; the current 16-by-36 queue source includes a floor-height source canvas, not permission to enlarge the person. Renderer/art preparation owns trimming/registration of source whitespace and mapping the existing C boxes to this body size. No per-style or per-camera random scaling, bobbing feet or aspect-dependent height. Preserve source aspect within the registered body box.
- Cabin geometry stays at its existing width and floor-height registration with bottom at y. Fit artwork inside that geometry; do not shrink the cabin world height from texture aspect. Effects use their explicit world boxes and semantic bottom anchor. Renderer interpolation follows successive simulation-frame samples, freezes when the frame freezes, and never changes authoritative positions or runs independent trips/queues.
- Preserve current semantic floor numbers; use these display labels consistently: semantic 0 displays `G`, negative -n displays `Bn`, positive n displays `Fn`. Actions and snapshot floor numbers remain unchanged. Labels are presentation only; do not add one to internal floors to imitate another game's numbering. Shared floor-band boundaries use the existing `ceil(worldY/36)` pick convention consistently.
- Tenant IDs and real person IDs are stable within their live entity lifetimes; synthetic occupant/cleaner IDs are visual slots, not saved person identities. Shaft/car IDs are current simulation slots. Clear renderer interpolation/selection caches on load/new tower or disappearance; do not treat these IDs as globally permanent across towers. No new persisted IDs or save migration.

## Ownership and focused acceptance

| Owner | Files / obligations |
| --- | --- |
| C implementation | `src/main.c`, `src/web_view.inc`, `src/tower.c`, `src/tower.h`: pending plan, native validation/pricing/commit, snapshot additions and correct semantic anchors; reuse existing game/people functions without editing their owners' files |
| Renderer | `web/view.js`, `tools/prepare_web_art.py`: exact rectangle ghosts, stable actor/body/cabin registration, queue presentation, office tenancy/day presence and four styles |
| Shell | `web/app.js`, `web/app.css`, `web/shell.html`: compact discoverable controls, preview price/count/skips, explicit Place/Cancel, matching stored gesture and floor labels; consume C decisions |
| Integration | Makefile, service worker/PWA, tests, other docs/release/artifacts; one integrated build and end-to-end acceptance |

Focused acceptance after source work: occupied/unsupported starting stamp followed by supported free spans; reverse horizontal drag; lot edge clamp; blocked middle room preserved; native deck/lobby gap additions shown/priced; multi-floor and promoted stairs anchors; insufficient funds yields the displayed deterministic subset; changed funds/legality cannot commit a different plan; repeated preview and Cancel leave Tower and RNG unchanged; existing-shaft add-car versus failed extension; exact queue counts despite clipping and people-off; occupied/empty cabins and pause; office night closure versus actual vacancy/re-let. C source and focused fixture syntax checks ran; no integrated build or runtime acceptance ran in this source phase.


## Implemented actor and motion amendment

`world.paused` is `GameSim.speed == SPEED_PAUSED`; frames, movement, door timers and queues advance only with simulation ticks. `cabins[].floor` and `legStart` are semantic segment-origin and run-origin floors; `direction` is -1 down, +1 up, 0 when at target. `holdTimer` is the native patience dwell. Existing `y`, `target`, `moveTimer`, `moveTotal`, `doors`, `occupancy` and `capacity` remain the source; FULL means `occupancy >= capacity`. The browser receives decoded segment duration in `moveTotal`.

`people_car_motion` in `src/people.c` replaces the old discrete four-gear jumps with a symmetric acceleration/cruise/braking distance profile (acceleration 0.125 floors/tick², standard/service cruise 1 floor/tick, express cruise 3 floors/tick). Short trips have triangular profiles and no compulsory cruise. The simulation uses its segment durations, rounded upward to whole ticks; both SDL and the world snapshot use its fractional position sample. Floors no longer teleport at departure. Express cruise segments span three floors; other segments span one. Existing timer bytes pack duration/stride without changing any persisted struct sizes or the save format. Mid-flight target changes retain the current segment and recompute following segments. A late call inside an already committed express segment waits for a return sweep so the physical car cannot teleport backward. Discrete tick rounding still applies. Hall-call scoring treats a departing car as having passed its origin so the slower departure cannot reclaim its own leftover call. Dispatch selection, routing, passenger capacity, doors and boarding retain their existing rules. This is an implemented port motion choice, not a claim about original executable timing.

Queue `people[]` additionally exports `waitFrames`, `waitBand`, `home`, `currentFloor`, `destination`, `legFloor`. `waitBand` is native visual stress 0/1/2: 80 for pink, 150 for red (200 at four stars), with the native `queue_hot` and housekeeping/service tint exemption. `stress` is banked plus current wait; `waitFrames` is current queue time. All floor fields are semantic. Queue counts include clipped actors and remain available with people animation disabled.

There is one existing `people[]` actor array. No additional waiting actor array or invented service queue is emitted: `PERSON_PLANNING` and `PERSON_AT_DEST` are not service queues, have no live queue clock, and `Person.x` is a spawn/home origin rather than a current location. An honest visible non-elevator waiting location requires new authoritative simulation data and remains a gap outside this change. Venue patrons, office workers and generic decorative occupants are not waiting lines.

Parking rooms additionally export `spaceUsable`, `spaceOrdinal`, `parked`, directly from `Tenant.space_usable`, `space_ordinal` and the existing office/suite car counters. Existing `parked-car` effects use the same rule and remain the visual source. Shafts and cabins already carry minimap geometry; no separate minimap model or invented parking load is introduced.

Source root causes are the old `ct_world_command` preview/confirmation split (`src/web_view.inc`), cinema RNG-sensitive initialization inside `place_item` (`src/tower.c`; the former world preview already suppressed it with `tower_preview=1`), lobby footprint validation that omitted its union gap and upper mirrors (`tower_can_place`), departure floor jumps and four-gear timing (`car_depart_or_idle` / `car_tick` in `src/people.c`), and the one-floor-only cabin interpolation formerly in `render_shaft` / `ct_world_state`. Tenancy truth remains `Tenant.state`; `people_office_workers` is daily desk presence and never a lease test.
