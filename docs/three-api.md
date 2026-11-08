# Three.js / DOM boundary

All functions below are Emscripten exports. JSON pointers remain C-owned; read immediately via `ccall(name,'string',...)`. Simulation remains in the existing main loop. Call `ct_visual_enable(1)` after installing `window.ctSound(id)`; SDL drawing and SDL pointer handling are then disabled. Native SDL remains unchanged.

## DOM

`ct_panel_state()` → JSON `{catalog,menus,panels,messages,history}`.

- catalog: `{id,label,width,height,cost,stars,enabled}` for every build type.
- menus: `{id,label,items:[{id,label,enabled,checked,shell}]}`. Item id is menu index * 100 + row index; separators omitted.
- panels: ordered bottom to top, `{kind,title,dismissible,lines:[],fields:[],actions:[]}`. Each field is `{action,label,value,min,max,step,disabled}` (numeric), or `{action,label,text,maxLength}` (text). Each action is `{action,label,value,disabled}`. Render these generically; send the exact action/value, current field text for text submissions. Fields submit immediately on change. Panel action names and values are authoritative.
- messages: event feed strings, newest last.
- history: chronological `stats_at` samples, oldest first: `{day,quarter,population,commuters,avgWait,balance,income,expenses,built,lost}`. `quarter` is raw 0..3 (display +1); financial values are dollars, `built` is standing construction value and `lost` is cumulative bulldozed value. Always present, empty before the first recorded quarter. Analytics SVG charts and the accessible data table consume these numeric fields directly; no parsing of panel text.

`ct_ui_action(const char *action, int value, const char *text)` → 1 handled, 0 rejected/unknown. `text` is always a string (empty when unused). `menu` with packed item id executes any menu entry; `close` with panel kind in text closes that panel. Panels expose every remaining action directly (rent, rename, movies, finding, elevator schedules/stops/home/car controls, mass pricing, tuning and all decisions). Query again after each action. `ct_ui_state()` keeps its existing HUD schema.

`ct_world_command(const char *action,int floor,int cell,int endFloor,int endCell)` → 1 handled, 0 rejected. Grid args use displayed floors and cells. Actions: `preview` sets ghost at pointer, `place` stamps selected tool using the native centering rule, `drag` places selected tool from first to last grid point through existing drag rules, `inspect` opens tenant/elevator, `delete` demolishes through route checks, `activate` uses selected tool or pointer inspection. `preview-clear` hides ghost. This is world input, never SDL click emulation.

## World

`ct_world_state()` → `{frame,camera:{x,y,zoom},time:{hour,minute},bounds:{width,minFloor,maxFloor},rooms,floors,people,cabins,shafts,effects,ghost,weather,event,animation}`.

World x uses 8 units/cell. World y is positive UP, 36 units/floor. Camera is `{x:cam_fx,y:-cam_fy}`. Rooms use **cells** for x/width, floors for floor/height. All people, cabins and effects use WORLD x/y with lower-left anchor. Cell/floor 0 is the ground lobby's upper edge in the old grid convention. `room.floor` is the LOWEST occupied grid row: bottom=(floor-1)*36 and top=(floor+height-1)*36. For a one-floor room only, top=floor*36. Width/height for people/cabins/effects are world units. `frame` is the true simulation tick; renderer interpolation uses elapsed render dt separately and must stop when frame stops.

Rooms: `{id,type,x,floor,width,height,state,occupied,lit,construction,burned,style,variant,rent,condition,venueState}`. Floors: `{floor,start,end}` (contiguous built grid spans, end exclusive). People: `{id,x,y,width,height,frame,kind,state,vip}`; includes live room occupants, walking/queued people and cleaners, with stable entity ids. Cabins: `{id,shaft,x,y,width,height,occupancy,capacity,doors,target,moveTimer,moveTotal}`. Shafts: `{id,type,x,width,lo,hi,hidden}` x/width cells, lo/hi displayed floors. Effects: `{kind,id,x,y,width,height,frame}` including fire fronts, helicopter, security, crane, Santa, vehicles, wedding and find marker. Weather `{rain,night}`; event `{active,type,pending}` never exposes a hidden bomb location. Ghost `{active,type,x,floor,width,height,valid}` x/width cells. Animation `{people,effects}`.

Sound: C applies the existing category mutes, then invokes `window.ctSound(wav_id)`; JS maps the original semantic wav id to bundled audio. No network synthesis.

## Integration details

`ct_visual_enable(1)` is valid before `callMain`; install the audio callback first. It also routes sounds without initializing the native audio device. `ct_ui_state` adds integer `speed` (0 paused, 1 normal, 2 fast, 3 turbo) and `running`. Existing `ct_control(0)` still toggles pause.

Menu `shell` is always a string: empty means execute the C `menu` action; `new`, `load`, `save`, `export-tdt`, `export-sav`, `screenshot`, `toolbar`, `infobar` request the browser shell's actual slot/persistence/capture/DOM operation. Shell must intercept these instead of capturing the hidden SDL canvas or overwriting the active save when creating a new slot. Menu ids include separators in row numbering. All ten native menu groups are included, including Quit (the native menu count omitted that last row before this change).

Dismiss the top panel only when `dismissible` is true. `close` uses its kind as `text`. Notice close acknowledges; route close cancels; quit close cancels. Disaster and the initial lobby-height choice require a visible decision. Choose height before the first build; first build otherwise locks the native one-floor default. Star awards, treasure, VIPs, event outcomes and all other one-button native notices retain their actual text and button.

Actions emitted by panels: `lobby-height`, `rent`, `rename` (value 0 tenant / 1 person), `name` (text), `name-delete`, `movie-open`, `movie` (0 ordinary / 1 hit), `person` (person id), `find`, `find-remove` (row id), `pricing-scope`, `pricing-TYPE` (rent class), `tuning-ROW` (new value), `tuning-reset`, `map-mode`, `elv-day`, `elv-period`, `elv-mode`, `elv-response`, `elv-patience`, `elv-show`, `elv-home-CAR` (displayed floor), `elv-stop` (displayed floor), `elv-add` (initial home floor), `elv-remove` (car index), `elv-simulate`, `quit` (0 save/quit, 1 quit, 2 cancel), `route` (0 no / 1 yes), `disaster` (0 free / 1 paid), `notice`. Fields carry current real values except mass-pricing rows, where value 1 is the default class to apply, not a claim that all units share a price. Per-car removal uses the native rule: last car removes the shaft after any route-loss confirmation.

HUD adds integer `mapMode` and `debug`; the world snapshot also includes `mapMode` and boolean `debug` so overlays and labels use C state.

World action `shaft-drag` takes a motor/pit start floor/cell and destination floor; it invokes the same cap extension/retraction path as native. `delete` preserves native car/whole-shaft/room dispatch. `person` actions also allow Three to inspect a picked person's stable id without any screen-coordinate emulation.

Ghost adds `endFloor`, `endCell`, `count`, `cost`, `reason`. Preview copies the Tower and runs the actual `tower_place`/`tower_extend_deck` rules in gesture order, so cumulative funds, support, overlap and whole-span geometry are authoritative. `valid` requires every proposed new stamp to succeed. Existing same-shaft segments are neutral when extending; an entirely existing-shaft gesture previews the native add-car operation. `tower_preview` suppresses scratch-placement logging and cinema RNG, and uses a separate rejection buffer. The live tower, style counters, money and RNG remain unchanged. `place`/`drag` revalidate immediately before committing; if the complete gesture no longer fits, they return 0 without partial construction. Native SDL retains its existing partial-drag behavior. Preview returns 1 for accepted pointer state; read `ghost.valid` for legality. Room, floor and cabin positions are simulation state; renderer dt must never alter `frame` or advance a paused car.

Additional room fields: `fill`, `patrons`, `customers`, `retailOpen`, `evaluation`, `demand`, `population`. Transport/venue vehicles appear as `parked-car`, `garbage-truck`, `train` effects; their room state also remains available for integrated rendering. `edit:{active,shaft}` identifies elevator Simulate isolation. Ambient clouds/skyline/rain and night lighting use camera/time/weather/frame in Three; there is no hidden bomb location in the snapshot. People `kind` values are `occupant`, `queue`, `walking`, `cleaner`; synthetic occupant/cleaner ids exceed `MAX_PEOPLE` and are visual marks, while live entity ids 1..4096 can be passed to the `person` action.

Validation: Emscripten syntax check with SDL2/SDL_ttf and native C11 syntax check pass. Web reports only three pre-existing unused native drawing functions. The integration owner runs the actual web build and end-to-end UI verification; no production deployment is part of this boundary change.

## Coordinate anchors

| Array / object | Units and anchor | World footprint |
| --- | --- | --- |
| camera | WORLD center; x=cam_fx, y=-cam_fy | View center, zoom independent of DPR |
| rooms | x/width CELLS; floor LOWEST native grid row; height floors | left=x*8; right=(x+width)*8; bottom=(floor-1)*36; top=(floor+height-1)*36 |
| floors | start/end CELLS, end exclusive; floor grid row | left=start*8; right=end*8; bottom=(floor-1)*36; top=floor*36 |
| people | WORLD lower-left x/y, WORLD width/height | right=x+width; top=y+height; walking position already interpolates the current simulation tick |
| cabins | WORLD lower-left x/y, WORLD width/height | right=x+width; top=y+height; y includes move_timer/move_total progress; target is displayed floor |
| shafts | x/width CELLS; lo/hi displayed grid rows, inclusive | body left=x*8; bottom=(lo-1)*36; top=hi*36; motor row=hi+1, pit row=lo-1 |
| effects | WORLD lower-left x/y, WORLD width/height | right=x+width; top=y+height; frame selects art/pose, id is stable within kind |
| ghost | x/width CELLS; floor LOWEST affected row; height floors | Same footprint formula as rooms; dimensions enclose the entire proposed gesture |

The native evidence for multi-floor rooms is `render_tower`: `draw_y=ty-(height-1)*CELL_H`, `draw_h=height*CELL_H`, where `ty=-floor*CELL_H` before camera translation. Therefore `top=floor*36`, `bottom=(floor-height)*36` is incorrect for multi-floor native tenant records; that formula assumes `floor` names the top row. The snapshot preserves the native stored floor. A one-floor interior excludes the 12-unit ceiling band, but its complete grid footprint follows the table above.

Multi-floor examples, verified against `ITEM_HEIGHT`, the native multi-floor draw branch and `.TDT` continuation mapping:

- New cathedral: `floor=100,height=5` occupies rows 100..104, bottom=3564, top=3744, centerY=3654. Imported cathedrals can have floor 99; use the stored value, without a renderer offset. While a wedding is active, native art gains a sixth decorative strip above the dome; occupancy stays five rows, and the decorative art keeps the same bottom.
- Metro at B10: `floor=-10,height=3` occupies rows -10..-8, bottom=-396, top=-288, centerY=-342. The train/platform effect stays on the bottom row at y=-396; the station itself rises through three rows.
- Any complete room/ghost mesh center: `y=(floor-1)*36+height*18`. This handles cathedral, metro, cinema, party hall, recycling and tall stairs without per-type anchor adjustments.

Loop sound bridge: install `window.ctSoundLoop(wav_id,on)` before `callMain` alongside `ctSound`. Both ON and OFF carry the actual loop sound id (build clatter or fire), never a zero-id stop command. Native loop transitions route through this callback only while `web_visual` is active; native SDL audio behavior is retained. Fire loops follow the existing Events category mute. Because DOM previews do not arm native `game.dragging`, the shell sends `ct_ui_action("build-loop",1,"")` during an active construction drag (C checks cached `web_ghost_valid` from the preceding preview), and value 0 on pointer release/cancel, tool change and preview cancellation. A stationary placement preview does not loop construction sound. Add-car preview refusal now supplies its current max-car/funds reason directly, without carrying prior scratch rejection text.
