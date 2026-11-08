/* Web presentation boundary; included after the native UI/rule handlers. */
#define J(...) p += sprintf(p, __VA_ARGS__)
#define Q(value) do { const unsigned char *q = (const unsigned char *)(value); J("\""); for (; *q; q++) { if (*q == '"' || *q == '\\') J("\\%c", *q); else if (*q < 32) J("\\u%04x", *q); else J("%c", *q); } J("\""); } while (0)
#define BOOL(value) ((const char *[2]){"false", "true"})[!!(value)]
#define SEP() do { if (n++) J(","); } while (0)
#define PANEL(k,t) do { if (panels++) J(","); J("{\"kind\":"); Q(k); J(",\"title\":"); Q(t); J(",\"dismissible\":%s,\"lines\":[",BOOL(strcmp(k,"disaster") && strcmp(k,"lobby"))); n = 0; } while (0)
#define LINE(t) do { SEP(); Q(t); } while (0)
#define FIELDS() do { J("],\"fields\":["); n = 0; } while (0)
#define FIELD(a,l,v,lo,hi,st,d) do { SEP(); J("{\"action\":"); Q(a); J(",\"label\":"); Q(l); J(",\"value\":%d,\"min\":%d,\"max\":%d,\"step\":%d,\"disabled\":%s}", (int)(v),(int)(lo),(int)(hi),(int)(st),BOOL(d)); } while (0)
#define ACTIONS() do { J("],\"actions\":["); n = 0; } while (0)
#define ACTION(a,l,v,d) do { SEP(); J("{\"action\":"); Q(a); J(",\"label\":"); Q(l); J(",\"value\":%d,\"disabled\":%s}",(int)(v),BOOL(d)); } while (0)
#define END_PANEL() J("]}")

EMSCRIPTEN_KEEPALIVE
void ct_visual_enable(int enabled) { web_visual = enabled; }

EMSCRIPTEN_KEEPALIVE
int ct_world_command(const char *action, int floor, int cell, int end_floor, int end_cell)
{
    if (!strcmp(action, "preview-clear")) { web_ghost = 0; return 1; }
    if (floor < TOWER_MIN_FLOOR) floor = TOWER_MIN_FLOOR;
    if (floor > TOWER_TOP_FLOOR) floor = TOWER_TOP_FLOOR;
    if (end_floor < TOWER_MIN_FLOOR) end_floor = TOWER_MIN_FLOOR;
    if (end_floor > TOWER_TOP_FLOOR) end_floor = TOWER_TOP_FLOOR;
    if (cell < 0) cell = 0;
    if (cell >= TOWER_WIDTH) cell = TOWER_WIDTH-1;
    if (end_cell < 0) end_cell = 0;
    if (end_cell >= TOWER_WIDTH) end_cell = TOWER_WIDTH-1;
    game.mouse_floor = floor;
    game.mouse_cell = cell;
    if (game.quit_confirm || game.route_confirm || game.notice_modal || game.disaster_modal ||
        game.find_open || game.name_edit_open || game.movie_dlg_open || game.elv_edit_mode || game.sim.event.active) {
        if(web_ghost) { web_ghost_valid=0; snprintf(web_ghost_reason,sizeof web_ghost_reason,"Close the active dialog or event first"); }
        return 0;
    }
    if (!strcmp(action, "delete") || (!strcmp(action, "activate") && game.demolish_mode)) {
        demolish_click_grid(floor, cell); return 1;
    }
    if (!strcmp(action, "inspect") || (!strcmp(action, "activate") && game.build_type == ITEM_NONE)) {
        if (open_elv_dialog_at_mouse(game.screen_w / 2, 24)) return 1;
        uint16_t tid = stair_hit_test(floor, cell);
        if (!tid) tid = game.tower.grid[floor_to_index(floor)][cell].tenant_id;
        if (!tid) return 0;
        open_tenant_popup_at(tid, game.screen_w / 2, 24); return 1;
    }
    if (!strcmp(action,"shaft-drag")) {
        ItemType saved=game.build_type;
        if(!try_cap_drag()) return 0;
        game.mouse_floor=end_floor; cap_drag_track();
        game.cap_drag=game.dragging=0; game.build_type=saved; return 1;
    }
    int preview = !strcmp(action, "preview");
    if (!preview && strcmp(action, "place") && strcmp(action, "drag")) return 0;
    ItemType type = game.build_type;
    if (type <= ITEM_NONE || !item_unlocked(type)) {
        web_ghost_valid=0; snprintf(web_ghost_reason,sizeof web_ghost_reason,"Build tool unavailable"); return 0;
    }
    int base = build_origin_floor(type, floor), x = build_origin_cell(cell);
    int last = build_origin_cell(end_cell), step = 1;
    if (!item_is_elevator(type)) end_floor = floor;
    if (preview) {
        web_ghost=1; web_ghost_valid=0; web_ghost_count=0; web_ghost_cost=0;
        web_skipped_count=0; web_add_car=0; web_ghost_reason[0]=0;
        web_type=type; web_start_floor=floor; web_start_cell=cell;
        web_end_floor=end_floor; web_end_cell=end_cell;
        web_before=game.tower;
    } else if (!web_ghost || !web_ghost_valid || type!=web_type ||
               floor!=web_start_floor || cell!=web_start_cell ||
               end_floor!=web_end_floor || end_cell!=web_end_cell) return 0;
    static Tower trial;
    trial=game.tower;
    if (preview && item_is_elevator(type)) x=elevator_snap_column_at(x,floor);
    if (preview) {
        web_ghost_x=x; web_ghost_floor=base;
        web_ghost_width=ITEM_WIDTH[type]; web_ghost_height=ITEM_HEIGHT[type];
    }
    if (item_is_elevator(type)) {
        last=end_floor;
        if (last<base) step=-1;
    } else if (last<x) { int swap=x; x=last; last=swap; }
    tower_preview=1;
    int attempted=0, blocked=0, n=0;
    for (int cursor=x, f=base; ; ) {
        if (!preview) {
            if (n==web_ghost_count) break;
            cursor=web_ops[n].x; f=web_ops[n].floor;
        }
        long money=trial.money;
        int success=0, noop=0;
        if (preview && item_is_elevator(type) && trial.grid[floor_to_index(f)][cursor].type==type) noop=1;
        else if (preview && type==ITEM_FLOOR && trial.grid[floor_to_index(f)][cursor].type!=ITEM_NONE) noop=1;
        else if (preview && item_is_elevator(type) && blocked) {
            snprintf(web_ghost_reason,sizeof web_ghost_reason,"Shaft extension is disconnected");
        } else if (!preview && web_add_car) {
            success=elev_can_add_car_at(cursor,f)==1 &&
                    game.sim.people.shafts[web_car_shaft].num_cars==web_car_count;
            if (success) trial.money-=elv_car_cost(type);
        } else {
            attempted++;
            success=tower_preview_place(&trial,type,f,cursor)!=0;
            if (!success) snprintf(web_ghost_reason,sizeof web_ghost_reason,"%s",tower_reject_reason());
        }
        if (success) {
            if (preview) {
                web_ops[n].x=cursor; web_ops[n].floor=f;
                web_ops[n].cost=money-trial.money;
                n++; web_ghost_count=n;
            } else {
                if (money-trial.money!=web_ops[n].cost) break;
                n++;
            }
        } else if (!preview) break;
        else if (!noop) {
            web_skipped[web_skipped_count].x=cursor;
            web_skipped[web_skipped_count].floor=f;
            snprintf(web_skipped[web_skipped_count++].reason,160,"%s",web_ghost_reason);
            if (item_is_elevator(type)) blocked=1;
        }
        if (!preview) continue;
        if (item_is_elevator(type)) {
            if (f==last) break;
            f+=step;
        } else {
            int advance=1;
            if (success && type!=ITEM_FLOOR) advance=ITEM_WIDTH[type];
            cursor+=advance;
            if (cursor>last) break;
        }
    }
    tower_preview=0;
    if (preview) {
        if (item_is_elevator(type) && !attempted && !blocked && !n) {
            if (elev_can_add_car_at(x,floor)==1) {
                web_add_car=1; web_ghost_count=1;
                web_ops[0].x=x; web_ops[0].floor=floor;
                web_ops[0].cost=elv_car_cost(type); trial.money-=web_ops[0].cost;
                for (int si=0;si<game.sim.people.shaft_count;si++) {
                    ElevatorShaft *shaft=&game.sim.people.shafts[si];
                    if (shaft->active && shaft->type==type && shaft->x==x &&
                        floor_to_index(floor)>=shaft->lo && floor_to_index(floor)<=shaft->hi) {
                        web_car_shaft=si; web_car_count=shaft->num_cars; break;
                    }
                }
            } else {
                snprintf(web_ghost_reason,sizeof web_ghost_reason,"Cannot add a car here");
                for(int si=0;si<game.sim.people.shaft_count;si++) {
                    ElevatorShaft *shaft=&game.sim.people.shafts[si];
                    if(!shaft->active || shaft->type!=type || shaft->x!=x || floor_to_index(floor)<shaft->lo || floor_to_index(floor)>shaft->hi) continue;
                    snprintf(web_ghost_reason,sizeof web_ghost_reason,"Not enough money for construction");
                    if(shaft->num_cars>=CARS_PER_SHAFT) snprintf(web_ghost_reason,sizeof web_ghost_reason,"No more cars in this shaft");
                    break;
                }
            }
        }
        web_ghost_valid=web_ghost_count>0;
        web_ghost_cost=game.tower.money-trial.money;
        web_plan=trial;
        if (web_skipped_count) snprintf(web_ghost_reason,sizeof web_ghost_reason,"%d skipped: %.130s",web_skipped_count,web_skipped[0].reason);
        return 1;
    }
    int same=n==web_ghost_count && game.tower.money-trial.money==web_ghost_cost &&
             trial.tenant_count==web_plan.tenant_count && trial.lobby_height==web_plan.lobby_height &&
             !memcmp(trial.grid,web_plan.grid,sizeof trial.grid);
    for (int i=0;same && i<trial.tenant_count;i++) {
        Tenant *a=&trial.tenants[i], *b=&web_plan.tenants[i];
        same=a->id==b->id && a->type==b->type && a->x==b->x && a->floor==b->floor && a->width==b->width && a->height==b->height;
    }
    if (!same) {
        web_ghost_valid=0;
        snprintf(web_ghost_reason,sizeof web_ghost_reason,"Plan changed; adjust preview");
        return 0;
    }
    if (web_add_car) elev_add_car_at(web_ops[0].x,web_ops[0].floor);
    else {
        for (int i=0;i<web_ghost_count;i++) tower_place(&game.tower,type,web_ops[i].floor,web_ops[i].x);
        metro_seed_evening_aux();
        game_notify_built(&game.sim,&game.tower);
        play_snd(SND_BUILD_PLACE);
    }
    web_ghost=0;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int ct_ui_action(const char *action, int value, const char *text)
{
    if (!strcmp(action,"build-loop")) {
        web_sound_loop(SND_BUILD_DRAG,value && web_ghost && web_ghost_valid && !game.sim.event.active && !sound_muted(SND_BUILD_DRAG)); return 1;
    }
    if (!strcmp(action,"close")) {
        if (!strcmp(text,"notice")) action="notice";
        if (!strcmp(text,"route")) { action="route"; value=0; }
        if (!strcmp(text,"quit")) { action="quit"; value=2; }
    }
    if (game.notice_modal) {
        if (strcmp(action, "notice")) return 0;
        notice_close(); return 1;
    }
    if (game.disaster_modal) {
        if (strcmp(action, "disaster")) return 0;
        if (value == 1) disaster_do_ransom(); else disaster_do_proceed();
        return 1;
    }
    if (game.route_confirm) {
        if (strcmp(action, "route")) return 0;
        if (value) route_confirm_yes(); else route_confirm_close(); return 1;
    }
    if (game.quit_confirm) {
        if (strcmp(action, "quit")) return 0;
        if (value == 0) { if (!do_save_game()) return 0; web_syncfs(); game.running = 0; }
        if (value == 1) game.running = 0;
        if (value == 2) { game.quit_confirm = 0; game.sim.speed = game.quit_saved_speed; }
        return 1;
    }
    if (!strcmp(action, "close")) {
        if (!strcmp(text,"inspect")) game.inspect_open = 0;
        if (!strcmp(text,"person")) game.person_open = 0;
        if (!strcmp(text,"finance")) game.fin_open = 0;
        if (!strcmp(text,"map")) game.win_map = 0;
        if (!strcmp(text,"analytics")) game.show_stats = 0;
        if (!strcmp(text,"tuning")) game.show_tuning = 0;
        if (!strcmp(text,"pricing")) game.show_masspricing = 0;
        if (!strcmp(text,"find")) game.find_open = 0;
        if (!strcmp(text,"movie")) game.movie_dlg_open = 0;
        if (!strcmp(text,"name")) close_name_editor();
        if (!strcmp(text,"elevator")) { elv_edit_exit(); game.elv_open = 0; }
        return 1;
    }
    if (!strcmp(action,"menu")) {
        int m = value / 100, r = value % 100;
        if (m < 0 || m >= TOP_MENU_COUNT || r < 0 || r >= top_menus[m].count || !top_menus[m].items[r].label) return 0;
        if (game.find_open || game.name_edit_open || game.movie_dlg_open || game.elv_edit_mode) return 0;
        const MenuItem *item = &top_menus[m].items[r];
        if (item->build_type) ct_tool(item->build_type);
        execute_menu_item(item); return 1;
    }
    if (!strcmp(action,"lobby-height")) {
        if(game.tower.lobby_height || value<1 || value>3) return 0;
        tower_choose_lobby_height(&game.tower,value); return 1;
    }
    if (!strcmp(action,"rent")) {
        Tenant *t = tower_tenant(&game.tower,game.inspect_tid);
        if (!t || value < 0 || value > 3) return 0;
        TiLayout l; ti_build(t,&l);
        if (!l.has_price || l.price_locked) return 0;
        game_set_rent_class(&game.sim,&game.tower,t,value); return 1;
    }
    if (!strcmp(action,"rename")) {
        if (value) open_person_name_editor();
        else { Tenant *t = tower_tenant(&game.tower,game.inspect_tid); if (!t) return 0; open_name_editor(t); }
        return 1;
    }
    if (!strcmp(action,"name")) {
        if (!game.name_edit_open) return 0;
        snprintf(game.name_edit_buf,sizeof game.name_edit_buf,"%.15s",text);
        game.name_edit_len = strlen(game.name_edit_buf); commit_name(); return 1;
    }
    if (!strcmp(action,"name-delete")) {
        if (game.name_edit_person) { const Person *p = person_popup_person(); if (p) tower_person_name_clear(&game.tower,p->home_tenant,p->member); }
        else tenant_clear_name(game.inspect_tid);
        close_name_editor(); return 1;
    }
    if (!strcmp(action,"movie-open")) { game.movie_dlg_open = 1; return 1; }
    if (!strcmp(action,"movie")) {
        Tenant *t = tower_tenant(&game.tower,game.inspect_tid);
        if (!t || !inspect_is_cinema(t) || value < 0 || value > 1) return 0;
        int cost = MOVIE_COST_ORDINARY; if (value) cost = MOVIE_COST_HIT;
        if (game.tower.money < cost) return 0;
        game_change_movie(&game.sim,&game.tower,t,value); game.movie_dlg_open = 0; return 1;
    }
    if (!strcmp(action,"person")) {
        if (value <= 0 || value > game.sim.people.people_high || !game.sim.people.people[value-1].home_tenant) return 0;
        open_person_popup_at(value,game.screen_w/2,24); return 1;
    }
    if (!strcmp(action,"find") || !strcmp(action,"find-remove")) {
        FindRow rows[FIND_ROWS]; int n = find_build_rows(rows);
        if (value < 0 || value >= n) return 0;
        if (!strcmp(action,"find")) find_do_find(&rows[value]);
        else if (game.find_open == 1) tower_person_name_clear(&game.tower,rows[value].tid,rows[value].member);
        else tenant_clear_name(rows[value].tid);
        return 1;
    }
    if (!strcmp(action,"pricing-scope")) { game.mp_all = !!value; return 1; }
    if (!strncmp(action,"pricing-",8)) {
        ItemType type = atoi(action+8);
        if (value < 0 || value > 3) return 0;
        for (int i=0;i<MP_ROWS;i++) if (mp_types[i].t == type) { mp_apply(type,value); return 1; }
        return 0;
    }
    if (!strcmp(action,"tuning-reset")) { tuning_reset(); return 1; }
    if (!strncmp(action,"tuning-",7)) {
        int i=atoi(action+7); if(i<0 || i>=TUNE_ROWS) return 0;
        if(value<tune_rows[i].min || value>tune_rows[i].max) return 0;
        *tune_rows[i].v=value; return 1;
    }
    if (!strcmp(action,"map-mode")) {
        if(value<0 || value>3) return 0;
        if(value==3 && game.tower.star_rating<2 && game.sim.mode!=MODE_SANDBOX) return 0;
        if(value==1) game_judge_daily(&game.sim,&game.tower);
        game.map_mode=value; return 1;
    }
    if (!strncmp(action,"elv-",4)) {
        int si=elv_dialog_shaft(); if(si<0) return 0;
        ElevatorShaft *s=&game.sim.people.shafts[si];
        if (!strcmp(action,"elv-day") && value>=0 && value<=1) game.elv_day=value;
        else if (!strcmp(action,"elv-period") && value>=0 && value<ELV_PERIODS) game.elv_period=value;
        else if (!strcmp(action,"elv-mode") && value>=0 && value<=2) s->sched_mode[game.elv_day][game.elv_period]=value;
        else if (!strcmp(action,"elv-response") && value>=1 && value<=100) s->sched_threshold[game.elv_day][game.elv_period]=value;
        else if (!strcmp(action,"elv-patience") && value>=0 && value<=3) s->sched_patience[game.elv_day][game.elv_period]=value;
        else if (!strcmp(action,"elv-show")) s->hidden=!value;
        else if (!strcmp(action,"elv-simulate")) { if(game.elv_edit_mode) elv_edit_exit(); else elv_edit_enter(); }
        else if (!strcmp(action,"elv-stop")) {
            int f=floor_to_index(value);
            if(game.elv_edit_mode || f<s->lo || f>s->hi || !elv_structural_stop(s,f)) return 0;
            request_stop_toggle(si,f);
        } else if (!strncmp(action,"elv-home-",9)) {
            int c=atoi(action+9), f=floor_to_index(value);
            if(game.elv_edit_mode || c<0 || c>=s->num_cars || f<s->lo || f>s->hi) return 0;
            people_set_home(&game.sim.people,si,c,f);
        } else if (!strcmp(action,"elv-remove")) {
            if(game.elv_edit_mode || value<0 || value>=s->num_cars) return 0;
            if(s->num_cars==1) {
                for(int f=s->lo;f<=s->hi;f++) if(game_stop_route_loss(&game.sim,&game.tower,si,f)) {
                    route_confirm_open(ROUTE_MSGS[3],3,si,0,0); return 1;
                }
                remove_shaft_now(si);
            } else { people_remove_car(&game.sim.people,si,value); play_snd(SND_DELETE); }
        } else if (!strcmp(action,"elv-add")) {
            if(game.elv_edit_mode) return 0;
            ItemType saved=game.build_type; game.build_type=s->type;
            int result=elev_add_car_at(s->x,value); game.build_type=saved; return result;
        } else return 0;
        return 1;
    }
    return 0;
}

EMSCRIPTEN_KEEPALIVE
const char *ct_panel_state(void)
{
    static char state[1048576]; char *p=state, line[256], action[32]; int n=0, panels=0;
    J("{\"catalog\":[");
    for(int i=1;i<ITEM_TYPE_COUNT;i++) {
        SEP(); J("{\"id\":%d,\"label\":",i); Q(tower_item_name(i));
        J(",\"width\":%d,\"height\":%d,\"cost\":%d,\"stars\":%d,\"enabled\":%s}",ITEM_WIDTH[i],ITEM_HEIGHT[i],ITEM_COST[i],ITEM_STAR_REQ[i],BOOL(item_unlocked(i)));
    }
    J("],\"menus\":[");
    for(int m=0;m<TOP_MENU_COUNT;m++) {
        if(m) J(","); J("{\"id\":%d,\"label\":",m); Q(top_menus[m].label); J(",\"items\":["); n=0;
        for(int r=0;r<top_menus[m].count;r++) {
            const MenuItem *it=&top_menus[m].items[r]; if(!it->label) continue;
            int checked=0;
            if(it->build_type && it->build_type==game.build_type) checked=1;
            switch(it->action) {
            case ACT_SPEED_PAUSE: checked=game.sim.speed==SPEED_PAUSED; break;
            case ACT_SPEED_1: checked=game.sim.speed==SPEED_NORMAL; break;
            case ACT_SPEED_2: checked=game.sim.speed==SPEED_FAST; break;
            case ACT_DEBUG_TOGGLE: checked=game.show_debug; break;
            case ACT_MODE_CAMPAIGN: checked=game.sim.mode==MODE_CAMPAIGN; break;
            case ACT_MODE_SANDBOX: checked=game.sim.mode==MODE_SANDBOX; break;
            case ACT_WIN_TOOLBAR: checked=game.win_toolbar; break;
            case ACT_WIN_INFOBAR: checked=game.win_infobar; break;
            case ACT_WIN_MAP: checked=game.win_map; break;
            case ACT_ANIM_PEOPLE: checked=game.anim_people; break;
            case ACT_ANIM_EFFECTS: checked=game.anim_effects; break;
            case ACT_SND_ELEV: checked=game.snd_elev; break;
            case ACT_SND_BG: checked=game.snd_bg; break;
            case ACT_SND_EVENTS: checked=game.snd_events; break;
            }
            SEP(); J("{\"id\":%d,\"label\":",m*100+r); Q(it->label);
            J(",\"enabled\":%s,\"checked\":%s",BOOL(!it->build_type || item_unlocked(it->build_type)),BOOL(checked));
            const char *shell="";
            switch(it->action) {
            case ACT_NEW_TOWER: shell="new"; break;
            case ACT_LOAD: shell="load"; break;
            case ACT_SAVE: shell="save"; break;
            case ACT_EXPORT_TDT: shell="export-tdt"; break;
            case ACT_EXPORT_SAV: shell="export-sav"; break;
            case ACT_SCREENSHOT: shell="screenshot"; break;
            case ACT_WIN_TOOLBAR: shell="toolbar"; break;
            case ACT_WIN_INFOBAR: shell="infobar"; break;
            }
            J(",\"shell\":"); Q(shell); J("}");
        } J("]}");
    }
    J("],\"panels\":[");
    if(!game.tower.lobby_height && game.build_type==ITEM_LOBBY) {
        PANEL("lobby","Choose lobby height"); LINE("The first construction locks this choice for this tower.");
        FIELDS(); ACTIONS(); ACTION("lobby-height","One floor",1,0); ACTION("lobby-height","Two floors",2,0); ACTION("lobby-height","Three floors",3,0); END_PANEL();
    }
    if(game.win_map) {
        PANEL("map","Tower map"); LINE("Select an overlay; navigate the tower in the world view."); FIELDS();
        FIELD("map-mode","Overlay: 0 Map, 1 Evaluation, 2 Rent, 3 Hotel",game.map_mode,0,3,1,0); ACTIONS(); END_PANEL();
    }
    if(game.fin_open) {
        PANEL("finance","Financial Statement");
        snprintf(line,sizeof line,"Year %d, Quarter %d",game.tower.day/12+1,(game.tower.day/3)%4+1); LINE(line);
        static const char *income[]={"Office","Single hotel","Twin hotel","Suite hotel","Shop","Fast food","Restaurant","Party hall","Cinema","Condo"};
        static const char *expenses[]={"Lobby","Standard elevators","Express elevators","Service elevators","Escalators","Parking ramps","Recycling","Metro","Housekeeping","Security"};
        long total=0,maint=0;
        for(int i=0;i<FIN_INCOME_CATS;i++) {
            long pop=0; for(int k=0;k<game.tower.tenant_count;k++) if(game_fin_income_cat(game.tower.tenants[k].type)==i) pop+=game.tower.tenants[k].population;
            snprintf(line,sizeof line,"%s: population %ld, income $%ld",income[i],pop,game.sim.fin_income_q[i]); LINE(line); total+=game.sim.fin_income_q[i];
        }
        for(int i=0;i<FIN_EXPENSE_CATS;i++) { snprintf(line,sizeof line,"%s maintenance: $%ld",expenses[i],game.sim.fin_expense_q[i]); LINE(line); maint+=game.sim.fin_expense_q[i]; }
        snprintf(line,sizeof line,"Income $%ld · Maintenance $%ld · Net $%ld",total,maint,total-maint); LINE(line);
        snprintf(line,sizeof line,"Other income $%ld · Construction $%ld",game.sim.fin_other_income_q,game.tower.built_value-game.sim.fin_built_at_q_start+game.sim.fin_construction_q); LINE(line);
        snprintf(line,sizeof line,"Previous balance $%ld · Balance $%ld",game.sim.fin_last_balance,game.tower.money); LINE(line);
        FIELDS(); ACTIONS(); END_PANEL();
    }
    if(game.show_stats) {
        PANEL("analytics","Analytics");
        snprintf(line,sizeof line,"Last day %d: income $%ld, expenses $%ld",game.sim.last_day_num,game.sim.last_day_income,game.sim.last_day_expenses); LINE(line);
        FIELDS(); ACTIONS(); END_PANEL();
    }
    if(game.show_tuning) {
        PANEL("tuning","Tuning / Modding"); FIELDS();
        for(int i=0;i<TUNE_ROWS;i++) { snprintf(action,sizeof action,"tuning-%d",i); TuneRow *r=&tune_rows[i]; FIELD(action,r->label,*r->v,r->min,r->max,r->step,0); }
        ACTIONS(); ACTION("tuning-reset","Restore original values",0,0); END_PANEL();
    }
    if(game.show_masspricing) {
        PANEL("pricing","Mass pricing"); LINE("Prices: 0 High, 1 Average, 2 Low, 3 Very low. Sold condos stay locked."); FIELDS();
        FIELD("pricing-scope","Scope: 0 Vacant only, 1 All",game.mp_all,0,1,1,0);
        for(int i=0;i<MP_ROWS;i++) { snprintf(action,sizeof action,"pricing-%d",mp_types[i].t); FIELD(action,tower_item_name(mp_types[i].t),1,0,3,1,0); }
        ACTIONS(); END_PANEL();
    }
    if(game.inspect_open) {
        Tenant *t=tower_tenant(&game.tower,game.inspect_tid);
        if(t) {
            TiLayout l; ti_build(t,&l); PANEL("inspect",l.title);
            LINE(l.status); for(int i=0;i<l.comment_n;i++) LINE(l.comments[i]);
            if(l.val9[0]) { snprintf(line,sizeof line,"Length / activity: %s",l.val9); LINE(line); }
            if(l.val10[0]) { snprintf(line,sizeof line,"Today's income: %s",l.val10); LINE(line); }
            if(l.has_eval) { snprintf(line,sizeof line,"Evaluation: %d / %d",l.eval_val,l.eval_hi); LINE(line); }
            if(l.has_patron) { snprintf(line,sizeof line,"Patrons: %d / %d",l.patron_val,l.patron_max); LINE(line); }
            if(l.has_newmovie) LINE(l.movie);
            FIELDS(); if(l.has_price) FIELD("rent","Price: 0 High, 1 Average, 2 Low, 3 Very low",t->rent_class,0,3,1,l.price_locked);
            ACTIONS(); if(l.has_rename) ACTION("rename","Rename",0,0);
            if(l.has_newmovie) ACTION("movie-open","New movie",0,0);
            for(int i=0;i<l.occ_n;i++) { snprintf(line,sizeof line,"Inspect person %d",l.occ_pid[i]); ACTION("person",line,l.occ_pid[i],0); }
            END_PANEL();
        } else game.inspect_open=0;
    }
    if(game.elv_open) {
        int si=elv_dialog_shaft();
        if(si>=0) {
            ElevatorShaft *s=&game.sim.people.shafts[si];
            PANEL("elevator",tower_item_name(s->type));
            snprintf(line,sizeof line,"Shaft %d · %d cars · capacity %d · floors %d to %d",si,s->num_cars,s->capacity,index_to_floor(s->lo),index_to_floor(s->hi)); LINE(line);
            if(game.elv_edit_mode) LINE("Simulate: frozen preview. Resume to keep schedule changes and restore the tower.");
            FIELDS(); FIELD("elv-day","Day: 0 Weekday, 1 Weekend",game.elv_day,0,1,1,0);
            FIELD("elv-period","Period: 0 7am-noon, 1 noon-12:30, 2 12:30-1pm, 3 1-5pm, 4 5-9pm, 5 9pm-1am",game.elv_period,0,ELV_PERIODS-1,1,0);
            FIELD("elv-mode","Mode: 0 Local, 1 Express up, 2 Express down",s->sched_mode[game.elv_day][game.elv_period],0,2,1,0);
            FIELD("elv-response","Waiting car response",s->sched_threshold[game.elv_day][game.elv_period],1,100,1,0);
            FIELD("elv-patience","Standard floor departure",s->sched_patience[game.elv_day][game.elv_period],0,3,1,0);
            FIELD("elv-show","Show shaft",!s->hidden,0,1,1,0);
            for(int c=0;c<s->num_cars;c++) { snprintf(action,sizeof action,"elv-home-%d",c); snprintf(line,sizeof line,"Car %d home floor",c+1); FIELD(action,line,index_to_floor(s->home[c]),index_to_floor(s->lo),index_to_floor(s->hi),1,game.elv_edit_mode); }
            ACTIONS();
            const char *sim_label="Simulate"; if(game.elv_edit_mode) sim_label="Resume";
            ACTION("elv-simulate",sim_label,0,0);
            snprintf(line,sizeof line,"Add car ($%d)",elv_car_cost(s->type)); ACTION("elv-add",line,index_to_floor(s->lo),game.elv_edit_mode || s->num_cars>=CARS_PER_SHAFT || game.tower.money<elv_car_cost(s->type));
            for(int c=0;c<s->num_cars;c++) { snprintf(line,sizeof line,"Remove car %d",c+1); ACTION("elv-remove",line,c,game.elv_edit_mode); }
            for(int f=s->lo;f<=s->hi;f++) {
                snprintf(line,sizeof line,"Floor %d · stop %s",index_to_floor(f),((const char*[]){"off","on"})[!!s->serviced[f]]);
                ACTION("elv-stop",line,index_to_floor(f),game.elv_edit_mode || !elv_structural_stop(s,f));
            }
            uint16_t ids[CAR_SLOTS*CARS_PER_SHAFT]; int count=elv_riders_collect(s,ids,CAR_SLOTS*CARS_PER_SHAFT);
            for(int i=0;i<count;i++) { snprintf(line,sizeof line,"Rider %d",ids[i]); ACTION("person",line,ids[i],0); }
            END_PANEL();
        }
    }
    if(game.person_open) {
        const Person *person=person_popup_person();
        if(person) {
            PANEL("person",person_kind_label(person_kind(person)));
            const char *name=tower_person_name(&game.tower,person->home_tenant,person->member); if(name) LINE(name);
            person_home_line(person,line,sizeof line); LINE(line); person_where_line(person,line,sizeof line); LINE(line);
            snprintf(line,sizeof line,"Stress: %d / %d",person->wait_accum,TUNING.wait_cap); LINE(line);
            FIELDS(); ACTIONS(); ACTION("rename","Name",1,0); END_PANEL();
        } else game.person_open=0;
    }
    if(game.find_open) {
        const char *title="Find tenant"; if(game.find_open==1) title="Find person";
        PANEL("find",title); FIELDS(); ACTIONS(); FindRow rows[FIND_ROWS]; int count=find_build_rows(rows);
        for(int i=0;i<count;i++) { ACTION("find",rows[i].name,i,0); snprintf(line,sizeof line,"Remove name: %s",rows[i].name); ACTION("find-remove",line,i,0); }
        END_PANEL();
    }
    if(game.movie_dlg_open) {
        PANEL("movie","New movie"); FIELDS(); ACTIONS();
        ACTION("movie","Ordinary movie · $150,000",0,game.tower.money<MOVIE_COST_ORDINARY);
        ACTION("movie","Hit movie · $300,000",1,game.tower.money<MOVIE_COST_HIT); END_PANEL();
    }
    if(game.name_edit_open) {
        PANEL("name","Rename"); FIELDS();
        J("{\"action\":\"name\",\"label\":\"Name\",\"text\":"); Q(game.name_edit_buf); J(",\"maxLength\":15}");
        ACTIONS(); ACTION("name-delete","Delete name",0,0); END_PANEL();
    }
    if(game.quit_confirm) {
        PANEL("quit","Save before quitting?"); FIELDS(); ACTIONS();
        ACTION("quit","Save and quit",0,0); ACTION("quit","Quit",1,0); ACTION("quit","Cancel",2,0); END_PANEL();
    }
    if(game.route_confirm) {
        PANEL("route","Route change"); LINE(game.route_confirm_text); FIELDS(); ACTIONS(); ACTION("route","Yes",1,0); ACTION("route","No",0,0); END_PANEL();
    }
    if(game.disaster_modal) {
        const char *title="Bomb threat"; if(game.sim.event.type==EVENT_FIRE) title="Fire";
        PANEL("disaster",title);
        if(game.sim.event.type==EVENT_FIRE) { snprintf(line,sizeof line,"Fire on floor %d. Emergency fire crew costs $%d.",game.sim.event.target_floor,FIRE_CHOPPER_COST); LINE(line); }
        else { snprintf(line,sizeof line,"Terrorists demand $%d. Security can search for the hidden bomb.",game.sim.event.ransom_cost); LINE(line); }
        FIELDS(); ACTIONS();
        if(game.sim.event.type==EVENT_FIRE) {
            ACTION("disaster","Proceed without helicopter",0,0); ACTION("disaster","Call helicopter",1,0);
        } else {
            ACTION("disaster","Deploy security",0,0); ACTION("disaster","Pay ransom",1,0);
        }
        END_PANEL();
    }
    if(game.notice_modal) { PANEL("notice","Tower"); LINE(game.notice_text); FIELDS(); ACTIONS(); ACTION("notice",game.notice_btn,0,0); END_PANEL(); }
    J("],\"messages\":["); n=0;
    for(int i=0;i<event_msg_total;i++) { int k=(event_msg_head-event_msg_total+i+EVENT_MSG_COUNT)%EVENT_MSG_COUNT; SEP(); Q(event_messages[k]); }
    J("],\"history\":[");
    for(int i=0;i<game.sim.stats.count;i++) {
        const StatSample *s=stats_at(&game.sim.stats,i);
        if(i) J(",");
        J("{\"day\":%d,\"quarter\":%d,\"population\":%d,\"commuters\":%d,\"avgWait\":%d,\"balance\":%lld,\"income\":%lld,\"expenses\":%lld,\"built\":%lld,\"lost\":%lld}",s->day,s->quarter,s->population,s->commuters,s->avg_wait,(long long)s->balance,(long long)s->income,(long long)s->expenses,(long long)s->built_value,(long long)s->lost_value);
    }
    J("]}"); return state;
}

EMSCRIPTEN_KEEPALIVE
const char *ct_world_state(void)
{
    static char state[16777216]; char *p=state; int n=0;
    PeopleSim *ps=&game.sim.people;
    memset(condo_lit,0,game.tower.tenant_count);
    for(int i=0;i<ps->people_high;i++) {
        const Person *person=&ps->people[i];
        if(!person->home_tenant || person->state!=PERSON_AT_DEST || person->errand==8) continue;
        Tenant *t=tower_tenant(&game.tower,person->home_tenant);
        if(t && t->type==ITEM_CONDO && person->cur_floor==floor_to_index(t->floor)) condo_lit[t-game.tower.tenants]=1;
    }
    J("{\"paused\":%s,\"mapMode\":%d,\"debug\":%s,\"frame\":%d,\"camera\":{\"x\":%.3f,\"y\":%.3f,\"zoom\":%.3f},\"time\":{\"hour\":%d,\"minute\":%d},\"bounds\":{\"width\":%d,\"minFloor\":%d,\"maxFloor\":%d},\"rooms\":[",BOOL(game.sim.speed==SPEED_PAUSED),game.map_mode,BOOL(game.show_debug),game.sim.frame,game.cam_fx,-game.cam_fy,game.zoom,game.sim.hour,game.sim.minute,TOWER_WIDTH,TOWER_MIN_FLOOR,TOWER_TOP_FLOOR);
    for(int i=0;i<game.tower.tenant_count;i++) {
        Tenant *t=&game.tower.tenants[i]; if(t->type==ITEM_NONE) continue;
        int lit=game.sim.hour>=7 && game.sim.hour<22;
        if(t->type==ITEM_OFFICE) lit=people_office_lit(&game.tower,t);
        if(t->type==ITEM_CONDO && (game.sim.time_of_day==TOD_EVENING || game.sim.time_of_day==TOD_NIGHT)) lit=condo_lit[i];
        int variant=twr_tenant_variant(&game.tower,t);
        SEP(); J("{\"id\":%d,\"type\":%d,\"x\":%d,\"floor\":%d,\"width\":%d,\"height\":%d,\"state\":%d,\"occupied\":%s,\"lit\":%s,\"construction\":%d,\"burned\":%s,\"style\":%d,\"variant\":%d,\"rent\":%d,\"condition\":%d,\"venueState\":%d,\"fill\":%d,\"patrons\":%d,\"customers\":%d,\"retailOpen\":%s,\"evaluation\":%d,\"demand\":%d,\"population\":%d}",t->id,t->type,t->x,t->floor,t->width,t->height,t->state,BOOL(t->state>=TENANT_OCCUPIED && t->state!=TENANT_ABANDONED),BOOL(lit),t->construction,BOOL(t->burned),t->style,variant,t->rent_class,t->condition,t->venue_state,t->fill_state,t->patrons_now,t->customers_today,BOOL(t->retail_open),game_tenant_eval_metric(&game.sim,&game.tower,t),t->demand_category,t->population);
        p--; /* append optional authoritative type fields before the room's closing brace */
        if(t->type==ITEM_OFFICE) J(",\"workers\":%d",people_office_workers(&game.tower,t));
        if(t->type==ITEM_PARKING) J(",\"spaceUsable\":%s,\"spaceOrdinal\":%d,\"parked\":%s",BOOL(t->space_usable),t->space_ordinal,BOOL(t->space_usable && t->space_ordinal<game.tower.cars_office+game.tower.cars_suite));
        J("}");
    }
    J("],\"floors\":["); n=0;
    for(int fi=0;fi<TOWER_FLOOR_COUNT;fi++) for(int x=0;x<TOWER_WIDTH;) {
        if(game.tower.grid[fi][x].type==ITEM_NONE) { x++; continue; }
        int start=x; while(x<TOWER_WIDTH && game.tower.grid[fi][x].type!=ITEM_NONE) x++;
        SEP(); J("{\"floor\":%d,\"start\":%d,\"end\":%d}",index_to_floor(fi),start,x);
    }
    J("],\"people\":["); n=0;
    if(game.anim_people) {
        for(int i=0;i<game.tower.tenant_count;i++) {
            Tenant *t=&game.tower.tenants[i]; TenantOccupants *o=&game.sim.occupants[i];
            if(t->type==ITEM_NONE) continue;
            if(t->type==ITEM_CONDO && !condo_lit[i] && (game.sim.time_of_day==TOD_NIGHT || game.sim.time_of_day==TOD_EVENING)) continue;
            int count=o->count;
            if(t->type==ITEM_OFFICE) {
                count=people_office_workers(&game.tower,t);
                if(t->state<TENANT_OCCUPIED || t->state==TENANT_ABANDONED || t->construction>0 || t->burned) count=0;
                if(count>o->count) count=o->count;
            }
            for(int k=0;k<count;k++) {
                SEP(); J("{\"id\":%d,\"tenant\":%d,\"x\":%d,\"y\":%d,\"width\":16,\"height\":24,\"frame\":%d,\"kind\":\"occupant\",\"state\":5,\"vip\":false}",MAX_PEOPLE+i*OCCUPANTS_MAX+k,t->id,(t->x+o->x[k])*CELL_W,(t->floor-1)*CELL_H,o->frame[k]);
            }
        }
        for(int si=0;si<ps->shaft_count;si++) {
            ElevatorShaft *s=&ps->shafts[si]; if(!s->active) continue;
            for(int f=s->lo;f<=s->hi;f++) {
                ElevatorStop *st=&s->stop[f]; int ll,rr; queue_line_limits(s,f,s->x*CELL_W,&ll,&rr);
                for(int d=0;d<2;d++) {
                    int count=st->up_count, head=st->up_head; uint16_t *ring=st->up_ring;
                    if(d) { count=st->down_count; head=st->down_head; ring=st->down_ring; }
                    for(int k=0;k<count;k++) {
                        int id=ring[(head+k)%QUEUE_CAP]; if(!id) continue;
                        int x=s->x*CELL_W-16-k*9; if(d) x=(s->x+ITEM_WIDTH[s->type])*CELL_W+k*9;
                        if(x<ll || x+16>rr) continue;
                        Person *person=&ps->people[id-1]; Tenant *home=tower_tenant(&game.tower,person->home_tenant);
                        int fig=(id*7)%30; if(fig>=25) fig+=10;
                        if(home && home->type==ITEM_HOUSEKEEPING && person->service) fig=25+id%3;
                        int wait=game.sim.frame-person->wait_start, band=0, bar=150;
                        if(wait<0) wait=0;
                        if(game.tower.star_rating>=4) bar=200;
                        int stress=person->wait_accum+wait;
                        if(game.queue_hot && !(home && home->type==ITEM_HOUSEKEEPING && person->service)) {
                            if(stress>=80) band=1;
                            if(stress>=bar) band=2;
                        }
                        int direction=1; if(d) direction=-1;
                        SEP(); J("{\"id\":%d,\"x\":%d,\"y\":%d,\"width\":16,\"height\":36,\"frame\":%d,\"kind\":\"queue\",\"state\":%d,\"vip\":%s,\"stress\":%d,\"waitFrames\":%d,\"waitBand\":%d,\"shaft\":%d,\"direction\":%d,\"order\":%d,\"home\":%d,\"currentFloor\":%d,\"destination\":%d,\"legFloor\":%d}",id,x,(index_to_floor(f)-1)*CELL_H,fig,person->state,BOOL(people_vip_is(id-1)),stress,wait,band,si,direction,k,person->home_tenant,index_to_floor(person->cur_floor),index_to_floor(person->dest_floor),index_to_floor(person->leg_floor));
                    }
                }
            }
        }
        for(int i=0;i<ps->people_high;i++) {
            Person *person=&ps->people[i]; if(person->state!=PERSON_WALKING || !person->home_tenant) continue;
            Tenant *stair=tower_tenant(&game.tower,person->walk_stair); if(!stair) continue;
            int rise=abs((int)person->cur_floor-(int)person->leg_floor), ticks=8;
            if(stair->type==ITEM_STAIRS) ticks=10;
            double progress=1.0-(double)person->walk_timer/(ticks*rise);
            double y=(index_to_floor(person->cur_floor)-1+(person->leg_floor-person->cur_floor)*progress)*CELL_H;
            SEP(); J("{\"id\":%d,\"x\":%.3f,\"y\":%.3f,\"width\":16,\"height\":24,\"frame\":%d,\"kind\":\"walking\",\"state\":%d,\"vip\":%s}",i+1,(stair->x+progress*(stair->width-2))*CELL_W,y,person_figure_frame(person),person->state,BOOL(people_vip_is(i)));
        }
        const PeopleCleanMark *marks; int count=people_clean_marks(&marks);
        for(int i=0;i<count;i++) {
            uint32_t h=((uint32_t)(game.sim.frame/16)+i*7u)*2654435761u;
            int cells=marks[i].w-2, offset=0; if(cells>0) offset=(h>>8)%(cells+1);
            SEP(); J("{\"id\":%d,\"x\":%d,\"y\":%d,\"width\":16,\"height\":24,\"frame\":%d,\"kind\":\"cleaner\",\"state\":5,\"vip\":false}",MAX_PEOPLE+MAX_TENANTS*OCCUPANTS_MAX+i,(marks[i].x+offset)*CELL_W,(index_to_floor(marks[i].fidx)-1)*CELL_H,0x60+(int)(h%3));
        }
    }
    J("],\"queues\":["); n=0;
    for(int si=0;si<ps->shaft_count;si++) {
        ElevatorShaft *shaft=&ps->shafts[si]; if(!shaft->active) continue;
        for(int f=shaft->lo;f<=shaft->hi;f++) for(int d=0;d<2;d++) {
            ElevatorStop *st=&shaft->stop[f];
            int count=st->up_count, head=st->up_head, direction=1, wait=0;
            uint16_t *ring=st->up_ring;
            if(d) { count=st->down_count; head=st->down_head; ring=st->down_ring; direction=-1; }
            for(int k=0;k<count;k++) {
                int id=ring[(head+k)%QUEUE_CAP]; if(!id) continue;
                int elapsed=game.sim.frame-ps->people[id-1].wait_start;
                if(elapsed>wait) wait=elapsed;
            }
            SEP(); J("{\"shaft\":%d,\"floor\":%d,\"direction\":%d,\"count\":%d,\"maxCount\":%d,\"waitFrames\":%d}",si,index_to_floor(f),direction,count,QUEUE_CAP,wait);
        }
    }
    J("],\"shafts\":["); n=0;
    for(int si=0;si<ps->shaft_count;si++) {
        ElevatorShaft *s=&ps->shafts[si]; if(!s->active) continue;
        SEP(); J("{\"id\":%d,\"type\":%d,\"x\":%d,\"width\":%d,\"lo\":%d,\"hi\":%d,\"hidden\":%s}",si,s->type,s->x,ITEM_WIDTH[s->type],index_to_floor(s->lo),index_to_floor(s->hi),BOOL(s->hidden));
    }
    J("],\"cabins\":["); n=0;
    for(int si=0;si<ps->shaft_count;si++) {
        ElevatorShaft *s=&ps->shafts[si]; if(!s->active) continue;
        for(int ci=0;ci<s->num_cars;ci++) {
            ElevatorCar *c=&s->car[ci]; if(!c->active) continue;
            double position; int stride;
            people_car_motion(s,c,&stride,&position);
            double y=(position+TOWER_MIN_FLOOR-1)*CELL_H;
            SEP(); J("{\"id\":%d,\"shaft\":%d,\"x\":%d,\"y\":%.3f,\"width\":%d,\"height\":36,\"occupancy\":%d,\"capacity\":%d,\"doors\":%d,\"target\":%d,\"moveTimer\":%d,\"moveTotal\":%d}",si*CARS_PER_SHAFT+ci,si,s->x*CELL_W,y,ITEM_WIDTH[s->type]*CELL_W,c->passengers,s->capacity,c->door_timer,index_to_floor(c->target),c->move_timer,c->move_total & 63);
            p--;
            int direction=0;
            if(c->target>c->floor) direction=1;
            if(c->target<c->floor) direction=-1;
            J(",\"floor\":%d,\"direction\":%d,\"legStart\":%d,\"holdTimer\":%d}",index_to_floor(c->floor),direction,index_to_floor(c->leg_start),c->hold_timer);
        }
    }
    J("],\"effects\":["); n=0;
#define EFFECT(k,i,x,y,w,h,f) do { SEP(); J("{\"kind\":"); Q(k); J(",\"id\":%d,\"x\":%.3f,\"y\":%.3f,\"width\":%d,\"height\":%d,\"frame\":%d}",(int)(i),(double)(x),(double)(y),(int)(w),(int)(h),(int)(f)); } while(0)
    floor_map_extents();
    if(game.anim_effects) {
        for(int fi=0;fi<TOWER_FLOOR_COUNT;fi++) {
            if(game.sim.event.active && game.sim.event.type==EVENT_FIRE) {
                int fronts[]={game.sim.event.fire_left[fi],game.sim.event.fire_right[fi]};
                for(int d=0;d<2;d++) {
                    int x=fronts[d]; if(x<0 || (d==1 && fronts[0]==x)) continue;
                    int solid=0; for(int c=x;c<x+FIRE_FRONT_CELLS && c<TOWER_WIDTH;c++) if(game.tower.grid[fi][c].type!=ITEM_NONE) solid=1;
                    if(solid) EFFECT("fire",fi*2+d,x*CELL_W,(index_to_floor(fi)-1)*CELL_H,96,36,(game.sim.frame/3)%4);
                }
            }
            if(ovl_right[fi]>0 && index_to_floor(fi)>0 && index_to_floor(fi)<=TOWER_MAX_FLOOR) {
                EFFECT("fire-escape",fi*2,(ovl_left[fi]-1)*CELL_W,(index_to_floor(fi)-1)*CELL_H,8,36,0);
                EFFECT("fire-escape",fi*2+1,ovl_right[fi]*CELL_W,(index_to_floor(fi)-1)*CELL_H,8,36,1);
            }
        }
        if(game.sim.event.active && game.sim.event.chopper_x>0) EFFECT("helicopter",0,game.sim.event.chopper_x*CELL_W,(game.sim.event.target_floor+2)*CELL_H,96,48,game.sim.frame%2);
        const GuardHunt *hunt=&game.sim.event.hunt;
        if(game.sim.event.active && hunt->active) for(int o=0;o<hunt->noffices;o++) for(int i=0;i<GUARDS_PER_OFFICE;i++) {
            const GuardState *g=&hunt->o[o].g[i]; if(g->retired || g->transit>0 || g->x<0) continue;
            int f=(g->x&1)*2; if((hunt->active==2 && g->below && g->pause>0) || (hunt->active!=2 && hunt->defuse>0)) f=4;
            EFFECT("guard",o*GUARDS_PER_OFFICE+i,g->x*CELL_W,(g->floor-1)*CELL_H,16,36,f);
        }
        for(int fi=TOWER_FLOOR_COUNT-1;fi>=0;fi--) if(ovl_right[fi]>0) {
            if(ovl_right[fi]-ovl_left[fi]>=7 && index_to_floor(fi)<TOWER_MAX_FLOOR) EFFECT("crane",0,ovl_left[fi]*CELL_W,index_to_floor(fi)*CELL_H,160,72,0);
            break;
        }
        if(game.sim.santa.active) EFFECT("santa",0,game.sim.santa.x+game.cam_fx-game.screen_w/2,0x84c-game.sim.santa.y,140,48,game.sim.frame%2);
        if(game.sim.wedding.active) for(int i=0;i<game.tower.tenant_count;i++) {
            Tenant *t=&game.tower.tenants[i]; if(t->type!=ITEM_CATHEDRAL) continue;
            int c=game.sim.wed_counter;
            if(c<14) { EFFECT("wedding",0,(t->x+c)*CELL_W,(t->floor-1)*CELL_H,16,24,0); EFFECT("wedding",1,(t->x+27-c)*CELL_W,(t->floor-1)*CELL_H,16,24,1); }
            else { int f=7; if(c<19) f=c-12; EFFECT("wedding",0,(t->x+13)*CELL_W,(t->floor-1)*CELL_H,16,24,f); }
        }
        int ground=floor_to_index(0);
        if(ovl_right[ground]>0) { EFFECT("entrance",0,ovl_left[ground]*CELL_W-56,-36,56,36,0); EFFECT("entrance",1,ovl_right[ground]*CELL_W,-36,56,36,1); }
    }
    if(game.anim_effects) for(int i=0;i<game.tower.tenant_count;i++) {
        Tenant *t=&game.tower.tenants[i];
        if(t->type==ITEM_PARKING && t->space_usable && t->space_ordinal<game.tower.cars_office+game.tower.cars_suite)
            EFFECT("parked-car",t->id,t->x*CELL_W,(t->floor-1)*CELL_H,t->width*CELL_W,24,2+t->id%13);
        if(t->type==ITEM_RECYCLING && t->fill_state==6) EFFECT("garbage-truck",t->id,t->x*CELL_W,(t->floor-1)*CELL_H,t->width*CELL_W,36,0);
        if(t->type==ITEM_METRO && t->venue_state==2) EFFECT("train",t->id,t->x*CELL_W,(t->floor-1)*CELL_H,t->width*CELL_W,36,0);
    }
    if(game.find_mark_until>game.sim.frame) EFFECT("find",0,game.find_mark_x*CELL_W,game.find_mark_floor*CELL_H,8,16,game.sim.frame%16);
#undef EFFECT
    int type=game.build_type;
    J("],\"ghost\":{\"active\":%s,\"type\":%d,\"x\":%d,\"floor\":%d,\"width\":%d,\"height\":%d,\"valid\":%s,\"endFloor\":%d,\"endCell\":%d,\"count\":%d,\"cost\":%ld,\"reason\":",BOOL(web_ghost && type>0),type,web_ghost_x,web_ghost_floor,web_ghost_width,web_ghost_height,BOOL(web_ghost_valid),web_end_floor,web_end_cell,web_ghost_count,web_ghost_cost); Q(web_ghost_reason);
    J(",\"operation\":"); if(web_add_car) Q("add-car"); else Q("build");
    J(",\"rects\":["); n=0;
    if(web_ghost && !web_add_car) {
        for(int i=0;i<web_plan.tenant_count;i++) {
            Tenant *t=&web_plan.tenants[i];
            if(t->type==ITEM_NONE) continue;
            const Tenant *old=NULL;
            for(int k=0;k<web_before.tenant_count;k++) if(web_before.tenants[k].id==t->id) { old=&web_before.tenants[k]; break; }
            if(old && t->type!=ITEM_LOBBY) continue;
            for(int x=t->x;x<t->x+t->width;) {
                if(old && x>=old->x && x<old->x+old->width) { x=old->x+old->width; continue; }
                int end=t->x+t->width;
                if(old && x<old->x) end=old->x;
                SEP(); J("{\"type\":%d,\"x\":%d,\"floor\":%d,\"width\":%d,\"height\":%d}",t->type,x,t->floor,end-x,t->height);
                x=end;
            }
        }
        for(int fi=0;fi<TOWER_FLOOR_COUNT;fi++) for(int x=0;x<TOWER_WIDTH;) {
            if(web_plan.grid[fi][x].type!=ITEM_FLOOR || web_before.grid[fi][x].type!=ITEM_NONE) { x++; continue; }
            int start=x++;
            while(x<TOWER_WIDTH && web_plan.grid[fi][x].type==ITEM_FLOOR && web_before.grid[fi][x].type==ITEM_NONE) x++;
            SEP(); J("{\"type\":%d,\"x\":%d,\"floor\":%d,\"width\":%d,\"height\":1}",ITEM_FLOOR,start,index_to_floor(fi),x-start);
        }
    }
    J("],\"skipped\":["); n=0;
    if(web_ghost) for(int i=0;i<web_skipped_count;i++) {
        SEP(); J("{\"x\":%d,\"floor\":%d,\"reason\":",web_skipped[i].x,web_skipped[i].floor); Q(web_skipped[i].reason); J("}");
    }
    J("]");
    J("},\"weather\":{\"rain\":%s,\"night\":%s},\"event\":{\"active\":%s,\"type\":%d,\"pending\":%s},\"animation\":{\"people\":%s,\"effects\":%s},\"edit\":{\"active\":%s,\"shaft\":%d}}",BOOL(game.rainy_day && game.sim.hour>=8 && game.sim.hour<16),BOOL(game.sim.time_of_day==TOD_NIGHT),BOOL(game.sim.event.active),game.sim.event.type,BOOL(game.sim.event.pending),BOOL(game.anim_people),BOOL(game.anim_effects),BOOL(game.elv_edit_mode),elv_dialog_shaft());
    return state;
}
#undef J
#undef Q
#undef BOOL
#undef SEP
#undef PANEL
#undef LINE
#undef FIELDS
#undef FIELD
#undef ACTIONS
#undef ACTION
#undef END_PANEL
