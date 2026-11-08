/* Focused tenancy and continuous lift-motion fixture. */
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include "game.h"
#include "people.c"
static Tower tw;
static GameSim sim;
int main(void)
{
    srand(1);
    tower_init(&tw); game_init(&sim);
    assert(tower_place(&tw,ITEM_LOBBY,0,100));
    assert(tower_place(&tw,ITEM_LOBBY,0,124));
    uint16_t id=tower_place(&tw,ITEM_OFFICE,1,100); assert(id);
    assert(tower_place(&tw,ITEM_ELEVATOR_SHAFT,0,120));
    assert(tower_place(&tw,ITEM_ELEVATOR_SHAFT,1,120));
    Tenant *office=tower_tenant(&tw,id);
    assert(office->state==TENANT_CONSTRUCTION);
    int saw_moving=0;
    for(int tick=0;tick<6000 && office->state!=TENANT_OCCUPIED;tick++) {
        game_update(&sim,&tw);
        if(office->state==TENANT_MOVING_IN) saw_moving=1;
    }
    assert(saw_moving && office->state==TENANT_OCCUPIED && office->id==id);
    for(int tick=0;tick<6000 && office->state!=TENANT_VACANT;tick++) game_update(&sim,&tw);
    assert(office->state==TENANT_VACANT);
    assert(people_office_workers(&tw,office)==0);
    tw.star_rating=1; office->rent_class=1;
    office->pool_stress_total=200; office->pool_stress_trips=1;
    game_judge_daily(&sim,&tw);
    assert(office->demand_category==0);
    game_stressed_moveout(&sim,&tw);
    assert(office->state==TENANT_ABANDONED && !office->capacity && !office->population && !office->demand_armed);
    assert(game_set_rent_class(&sim,&tw,office,3));
    assert(office->state==TENANT_ABANDONED && office->demand_armed && office->demand_category==2);
    people_rebuild_transport(&sim.people,&tw); game_update_reachability(&sim,&tw);
    long money=tw.money;
    for(int frame=0;frame<6000 && office->state!=TENANT_OCCUPIED;frame++) {
        people_update(&sim.people,&tw,frame,TOD_MORNING,9,sim.reach_public,sim.reach_service,0);
        game_relet_arrivals(&sim,&tw);
    }
    assert(office->state==TENANT_OCCUPIED && office->id==id);
    assert(tw.money==money+tenant_rent(ITEM_OFFICE,3));
    assert(office->capacity==CAP_MIN && !office->pool_stress_total && !office->pool_stress_trips);
    printf("office %u: construction -> moving -> leased -> overnight -> abandoned -> rate rescue -> mover re-let\n",id);

    /* Direct state-machine fixture; no simulation spawning or economy ticks. */
    const int distances[]={1,20,100};
    for(int express=0;express<2;express++) for(int route=0;route<3;route++) for(int loading=0;loading<3;loading++) {
        int floors=distances[route];
        people_init(&sim.people);
        ElevatorShaft *s=&sim.people.shafts[0]; s->active=1; s->capacity=21;
        s->type=ITEM_ELEVATOR_SHAFT; if(express) { s->type=ITEM_ELEVATOR_EXPRESS; s->capacity=42; }
        int load=loading*s->capacity/2;
        s->lo=floor_to_index(0); s->hi=floor_to_index(floors); s->num_cars=1;
        ElevatorCar *c=&s->car[0]; c->active=1; c->dir=1;
        c->floor=c->leg_start=s->lo; c->target=s->hi; c->passengers=load;
        c->dest_count[s->hi]=load;
        for(int i=0;i<load;i++) {
            Person *p=&sim.people.people[i]; p->home_tenant=id; p->state=PERSON_RIDING;
            p->dest_floor=s->hi; p->leg_floor=s->hi;
            c->pax[i]=i+1; c->pax_dest[i]=s->hi;
        }
        car_start_step(s,c);
        double previous=s->lo, peak=0, first=0, last=0; int ticks=0;
        while(!c->door_timer && ticks<255) {
            assert(c->passengers==load);
            car_tick(&sim.people,&tw,s,0,++ticks);
            double position; int stride; people_car_motion(s,c,&stride,&position);
            double velocity=position-previous;
            assert(velocity>=-1e-9 && position<=s->hi+1e-9);
            if(ticks==1) first=velocity;
            if(velocity>peak) peak=velocity;
            last=velocity; previous=position;
        }
        assert(c->floor==s->hi && c->door_timer==DOOR_OPEN_TICKS && c->passengers==load);
        assert(fabs(previous-s->hi)<1e-9 && first<peak && last<peak);
        car_tick(&sim.people,&tw,s,0,++ticks);
        assert(!c->passengers);
        printf("motion express=%d floors=%d load=%d arrival=%d first=%.5f peak=%.5f last=%.5f; doors/unboard ordered\n",express,floors,load,ticks-1,first,peak,last);
    }
    people_init(&sim.people);
    ElevatorShaft *s=&sim.people.shafts[0];
    s->active=1; s->capacity=21; s->type=ITEM_ELEVATOR_SHAFT; s->lo=0; s->hi=100;
    ElevatorCar *c=&s->car[0];
    c->active=1; c->floor=2; c->leg_start=0; c->target=80; c->dir=1;
    car_start_step(s,c); c->move_timer/=2;
    int stride; double before,after;
    people_car_motion(s,c,&stride,&before);
    s->up_call_car[4]=1; c->assigned_calls=1;
    car_retarget(s,c,0);
    people_car_motion(s,c,&stride,&after);
    assert(before==after && c->target==80);
    car_tick(&sim.people,&tw,s,0,1);
    assert(c->floor==3 && c->target==4 && !c->door_timer);
    printf("retarget preserves position %.9f until the committed segment ends\n",before);
}
