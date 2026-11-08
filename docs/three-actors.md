# Three actor registration and presentation

World coordinates retain the native units: 8 per cell, 36 per floor. A room's
bottom is `(floor - 1) * 36`; room art, selection, construction rectangles and
transport landings use that same lower-floor registration. Floor labels are G,
F1… and B1…; snapshots and commands keep their signed semantic floors.

## Size changes traced to source registration

The former art preparation cropped every person pose and cabin variant to its
individual alpha bounds. The renderer then calculated people as
`height * 0.8` and derived width from that changing crop. Queue snapshots used a
36-high source canvas, while other people used 24, so joining a queue enlarged
the same body by 50%. Cabins also derived their height from each cropped image's
aspect ratio. Loaded/empty art, pose and style changes therefore changed visible
geometry. Camera zoom was not part of either dimension formula; it magnified
these differences. Repeated samples restarted the interpolation even when the
simulation frame had not advanced.

Art preparation now uses the union of the original registered canvases across
all 24 person poses, and separately across the four cabin variants. It preserves
source pixels, aspect and horizontal frame registration, aligning each pose
to the shared foot baseline without resizing it. The source plates themselves
vary by 9–15 pixels in foot placement, independently of the former crop bug. White silhouette textures copy those exact alpha masks, allowing
flat native wait colors without multiplying the original clothes' colors.
These are deterministic derivatives of the existing source plates, not new
generated artwork. Historical source provenance, licenses and costs remain
unchanged.

People fit a fixed 16-by-24 body box, centered at `x + width/2`, feet at `y`.
Source resolution, pose, queue canvas height and camera zoom cannot enlarge that
box. Cabin geometry uses its explicit C width/height and bottom `y`; source art
fits inside it with its natural aspect. Pooled cabin children use normalized
coordinates, preventing inherited cabin scale from multiplying body dimensions.
Cabin silhouettes are bounded by actual occupancy, with up to five visible
slots increasing with occupancy/capacity; the label gives the exact count and
FULL at capacity. Zero occupancy draws no passengers. People-off removes
silhouettes, retaining cars, doors and authoritative labels.

The renderer linearly interpolates only successive authoritative simulation
samples over a bounded 50 ms interval. It does not restart interpolation on a
repeated frame, invent trips, ease a competing movement profile, or advance
boarding. Stopped cars and opening doors snap to the authoritative arrival. `paused` snaps to the
current sample. Acceleration, cruise, braking, arrival and speed remain C-owned. New calls retarget at committed segment boundaries so a changing target cannot move the cabin without a simulation tick. Completed construction uses the native non-positive sentinel and never receives scaffolding.
Disappearance removes actor views; frame rewind clears interpolation and
selection. Load/new tower also reloads the browser session.

## Queues, interiors and construction

Queue silhouettes retain their C identities and locations. `people[].waitBand` selects black, pink or red using C's native
thresholds and staff exemption. A raised pale shoulder mark is the non-color
impatient cue. Queue summaries use exact `count`, direction and `waitFrames`;
`+N` indicates the actual count exceeding the visible queue people. Floor/shaft
numbers occupy the shaft's top band, queue summaries the adjacent top band,
and actor bodies the lower band. Cabin target/direction and occupancy travel
with the cabin. No inferred line-length stress or invented overflow people. C exposes no other
genuine service queue position/clock: `Person.x` outside queue geometry can be
a stale spawn anchor, and planning/AT_DEST is not a queue. The renderer therefore
adds no speculative venue-wait actors; existing visitation/occupants remain.

Office furniture contains no baked-in workers. `occupied` controls tenancy;
`workers` bounds visible office occupants, independently of `lit`. State 5
retains its lease without a vacancy sign; state 7 shows VACANT. State 2 shows
AVAILABLE, while construction retains scaffolding. Office furniture follows
native light and burned state. Parking uses one recessed bay per native parking
room and only the authoritative `parked-car` effects, leaving unused slots
visibly empty. Other room types retain their existing contents artwork.

Stairs have a broad stepped contour, support and aligned landings; escalators
have thinner treads and the same continuous rail join. Both use native room
width and `(height - 1) * 36` rise. Parking ramps retain their source aspect.
Ghosts draw only `ghost.rects`, including separate deck and item footprints;
an add-car plan highlights the existing shaft. No enclosing ghost fills skipped
space.

## Integration visual verification

The source-only checks exercised actual Three objects without a WebGL build:
all four prepared styles have one common person canvas and one common cabin
canvas; 24 poses and changing zoom retain body boxes/feet; cabin occupancy
changes retain geometry; exact disjoint/underground ghost anchors, clipped queue
counts, FULL, people-off, and office state 5 versus 7 passed. This does not claim
browser visual acceptance.

After the single integrated build, verify these cases in all four live styles:

- Follow one real ID from waiting through walking/boarding, at near and far zoom.
  Feet stay on the floor; pose changes preserve body height. Cleaner and VIP
  art stay within the same registration. Zoom during a trip preserves cabin
  dimensions and shaft alignment.
- Record actual C start/cruise/brake/arrival, including a short triangular trip,
  loaded/empty/FULL cabin and door changes. Pause during travel and queueing;
  resume at each speed. There must be no drift, delayed arrival or extra rider.
- Clip both directions of a busy queue against a floor edge/neighbor. Check
  exact counts, overflow, mixed individual black/pink/red bands, impatient
  marks, hidden shafts and people-off. Check
  queue text against adjacent shafts and floor labels on mobile and desktop.
- Observe office 1→2→3, workday departure into state 5, actual state 7 vacancy,
  and native re-let. Furniture stays; workers and lights follow separate C
  signals. State 5 never receives VACANT. Check empty/occupied parking bays.
- Check normal/promoted stairs, escalators and multi-floor rooms at their lower
  anchor, basement B labels, and cabin target labels. Inspect disjoint affordable
  build rectangles and automatic deck/lobby additions; skipped gaps stay clear.
