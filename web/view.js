import * as THREE from 'three';

const styles = ['schematic', 'modern-pixel', 'warm-dollhouse', 'miniature-3d'];
const roomTiles = {1:12, 3:0, 4:1, 5:2, 6:2, 7:2, 8:5, 9:4, 10:3, 11:10, 12:9, 13:11, 14:13, 16:6, 17:7, 18:14, 24:8, 25:13};
const plane = new THREE.PlaneGeometry(1, 1);
const box = new THREE.BoxGeometry(1, 1, 1);
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const surface = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const point = new THREE.Vector3();
let renderer, scene, camera, canvas, engine, art, world;
let styleIndex = 2;
let requestedStyle = 2;
let running = false;
let width = 1, height = 1;
let lastSample = -Infinity, lastFrame = -1, sampleTime = 0;
let selected = null;
let hoverPoint = null;
let signature = '';
const rooms = new THREE.Group();
const structure = new THREE.Group();
const transport = new THREE.Group();
const figures = new THREE.Group();
const effects = new THREE.Group();
const city = new THREE.Group();
const clouds = new THREE.Group();
const roomViews = new Map();
const peopleViews = new Map();
const cabinViews = new Map();
const effectViews = new Map();
const ownedMaterials = [];
const ownedTextures = [];
const labels = new THREE.Group();
const rainPositions = new Float32Array(320 * 6);
const rainGeometry = new THREE.BufferGeometry();
rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({color:0xc4e0dd,transparent:true,opacity:0.35}));
const ghost = new THREE.Mesh(box, new THREE.MeshBasicMaterial({color:0x81c6ae, transparent:true, opacity:0.28, depthWrite:false}));
const marker = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({color:0xffdf98}));
const skyMaterial = new THREE.ShaderMaterial({
  depthWrite: false,
  uniforms: {night:{value:0}, top:{value:new THREE.Color('#a9c6c1')}, bottom:{value:new THREE.Color('#f1ddbc')}},
  vertexShader: 'varying vec2 pos; void main(){pos=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'varying vec2 pos; uniform float night; uniform vec3 top; uniform vec3 bottom; void main(){vec3 day=mix(bottom,top,smoothstep(0.15,0.85,pos.y));vec3 dark=mix(vec3(0.12,0.19,0.25),vec3(0.035,0.065,0.13),pos.y);gl_FragColor=vec4(mix(day,dark,night),1.0);\n#include <colorspace_fragment>\n}'
});
const sky = new THREE.Mesh(plane, skyMaterial);
const soilMaterial = new THREE.MeshBasicMaterial({color:0x4b4540});
const soil = new THREE.Mesh(plane, soilMaterial);

window.ctView = {
  async init(target, module) {
    canvas = target;
    engine = module;
    renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false});
    renderer.setPixelRatio(devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-0.5,0.5,0.5,-0.5,1,5000);
    camera.position.z = 1000;
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.5);
    sun.position.set(-400,700,600);
    scene.add(sun);
    scene.add(sky, city, clouds, soil, rooms, structure, transport, figures, effects, labels, rain, ghost, marker);
    sky.position.z = -1000;
    soil.position.set(1500,-1000,-100);
    soil.scale.set(16000,1928,1);
    ghost.visible = marker.visible = false;
    this.resize();
    await this.style(styleIndex);
  },
  resize() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(devicePixelRatio);
    renderer.setSize(width,height,false);
    camera.left=-width/2; camera.right=width/2;
    camera.top=height/2; camera.bottom=-height/2;
    camera.updateProjectionMatrix();
    if(running)engine.ccall('ct_resize',null,['number','number','number'],[width,height,devicePixelRatio]);
  },
  async style(index) {
    requestedStyle=index;
    const name=styles[index];
    const manifest=await (await fetch('hires/'+name+'/index.json')).json();
    const next={};
    await Promise.all(Object.entries(manifest).map(async ([category,data])=>{
      next[category]=await Promise.all(data.sprites.map(async sprite=>{
        const texture=await new THREE.TextureLoader().loadAsync('hires/'+name+'/'+sprite.file);
        texture.colorSpace=THREE.SRGBColorSpace;
        texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
        texture.magFilter=THREE.LinearFilter;
        return {texture,width:sprite.width,height:sprite.height};
      }));
    }));
    if (requestedStyle!==index) {
      for(const sprites of Object.values(next)) for(const sprite of sprites) sprite.texture.dispose();
      return;
    }
    if (art) for(const sprites of Object.values(art)) for(const sprite of sprites) sprite.texture.dispose();
    art=next; styleIndex=index; signature='';
    for(const group of [city,clouds]) {
      for(const child of group.children) child.material.dispose();
      group.clear();
    }
    const skyline=art['exterior-effects'][4];
    for(let i=-4;i<11;i++) {
      const mesh=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({map:skyline.texture,transparent:true,color:0xb1b8ae,opacity:0.38,depthWrite:false}));
      mesh.scale.set(300,300*skyline.height/skyline.width,1);
      mesh.position.set(i*295,-36+mesh.scale.y/2,-500);
      city.add(mesh);
    }
    const cloud=art['exterior-effects'][3];
    for(let i=0;i<9;i++) {
      const mesh=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({map:cloud.texture,transparent:true,opacity:0.4,depthWrite:false}));
      const size=80+i%3*35;
      mesh.scale.set(size,size*cloud.height/cloud.width,1);
      mesh.position.set(i*530-700,130+i%4*90,-650);
      clouds.add(mesh);
    }
  },
  start() {
    if(running)return;
    running=true;
    this.resize();
    world=JSON.parse(engine.ccall('ct_world_state','string',[],[]));
    camera.position.set(world.camera.x,world.camera.y,1000);
    camera.lookAt(world.camera.x,world.camera.y,0);
    camera.zoom=world.camera.zoom;
    camera.updateProjectionMatrix();
    requestAnimationFrame(this.draw);
  },
  pan(dx,dy) {
    engine.ccall('ct_pan',null,['number','number'],[dx,dy]);
    lastSample=-Infinity;
  },
  zoom(value,anchorX,anchorY) {
    const bounds=canvas.getBoundingClientRect();
    let x=bounds.left+width/2, y=bounds.top+height/2;
    if(Number.isFinite(anchorX))x=anchorX;
    if(Number.isFinite(anchorY))y=anchorY;
    const before=this.pick(x,y);
    const old=camera.zoom;
    engine.ccall('ct_set_zoom',null,['number'],[value]);
    camera.zoom=value;
    camera.updateProjectionMatrix();
    const after=this.pick(x,y);
    engine.ccall('ct_pan',null,['number','number'],[(after.x-before.x)*value,(before.y-after.y)*value]);
    camera.zoom=old;
    camera.updateProjectionMatrix();
    lastSample=-Infinity;
  },
  pick(clientX,clientY) {
    const rect=canvas.getBoundingClientRect();
    pointer.set((clientX-rect.left)/width*2-1,1-(clientY-rect.top)/height*2);
    ray.setFromCamera(pointer,camera);
    ray.ray.intersectPlane(surface,point);
    const person=world.people.find(item=>item.id<=4096 && point.x>=item.x && point.x<=item.x+item.width && point.y>=item.y && point.y<=item.y+item.height);
    let personId=0;
    if(person)personId=person.id;
    return {x:point.x,y:point.y,personId,cell:Math.max(0,Math.min(374,Math.floor(point.x/8))),floor:Math.ceil(point.y/36)};
  },
  hover(value) {
    hoverPoint=value;
  },
  selection(value) {selected=value;},
  capture() {
    renderer.render(scene,camera);
    return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  },
  draw(now) {
    requestAnimationFrame(window.ctView.draw);
    if(now-lastSample>50) {
      world=JSON.parse(engine.ccall('ct_world_state','string',[],[]));
      lastSample=now;
      if(world.frame!==lastFrame){lastFrame=world.frame;sampleTime=now;}
      window.ctView.update();
    }
    const cx=world.camera.x,cy=world.camera.y;
    const tiltX=Math.max(-0.018,Math.min(0.018,(cx-1500)*0.000025));
    const tiltY=Math.max(-0.012,Math.min(0.016,(world.camera.zoom-1)*0.006));
    camera.position.set(cx+tiltX*1000,cy+tiltY*1000,1000);
    camera.lookAt(cx,cy,0);
    camera.zoom=world.camera.zoom;
    camera.updateProjectionMatrix();
    sky.position.set(cx,cy,-1000);
    sky.scale.set(width/camera.zoom*4+4000,height/camera.zoom*4+4000,1);
    skyMaterial.uniforms.night.value=world.weather.night;
    city.position.x=(cx-1500)*0.42;
    clouds.position.x=(cx-1500)*0.62;
    clouds.position.y=cy*0.08;
    rain.visible=world.weather.rain;
    if(rain.visible) {
      for(let i=0;i<320;i++) {
        const x=cx+((i*173)%2000-1000)/camera.zoom;
        const y=cy+(((i*97+world.frame*13)%1200)-600)/camera.zoom;
        rainPositions.set([x,y,20,x-2/camera.zoom,y-12/camera.zoom,20],i*6);
      }
      rainGeometry.attributes.position.needsUpdate=true;
      rainGeometry.computeBoundingSphere();
    }
    const night=world.weather.night;
    soilMaterial.color.set('#504b41');
    soilMaterial.color.multiplyScalar(1-night*0.35);
    for(const [id,mesh] of peopleViews) {
      const data=mesh.userData;
      const elapsed=Math.min(1,(now-data.sampled)/80);
      mesh.position.x=THREE.MathUtils.lerp(data.fromX,data.x,elapsed);
      mesh.position.y=THREE.MathUtils.lerp(data.fromY,data.y,elapsed);
    }
    for(const mesh of cabinViews.values()) {
      const data=mesh.userData;
      const elapsed=Math.min(1,(now-data.sampled)/80);
      mesh.position.y=THREE.MathUtils.lerp(data.fromY,data.y,elapsed);
    }
    for(const mesh of effectViews.values()) {
      if(mesh.userData.kind==='fire') {
        const phase=world.frame/3+Math.min(1,(now-sampleTime)/80);
        mesh.scale.y=mesh.userData.height*(0.92+Math.sin(phase*2+mesh.position.x)*0.08);
        mesh.material.opacity=0.85+Math.sin(phase*3)*0.1;
      }
    }
    let focus=selected;
    if(focus===null)focus=hoverPoint;
    if(focus!==null) {
      marker.visible=true;
      marker.position.set(focus.cell*8+4,focus.floor*36-18,12);
      marker.scale.set(8,36,2);
      const room=world.rooms.find(item=>focus.cell>=item.x && focus.cell<item.x+item.width && focus.floor>=item.floor && focus.floor<item.floor+item.height);
      if(room) {
        marker.position.set(room.x*8+room.width*4,(room.floor+room.height/2-1)*36,12);
        marker.scale.set(room.width*8,room.height*36,2);
      }
    } else marker.visible=false;
    renderer.render(scene,camera);
  },
  update() {
    for(const group of [rooms,structure,figures,effects])group.visible=!world.edit.active;
    for(const [id,mesh] of cabinViews)mesh.visible=!world.edit.active || mesh.userData.shaft===world.edit.shaft;
    const nextSignature=styleIndex+':'+world.debug+':'+JSON.stringify([world.floors,world.shafts,world.rooms.map(room=>[room.id,room.type,room.x,room.floor,room.width,room.height,Boolean(room.construction),room.burned,room.state,room.occupied])]);
    if(nextSignature!==signature) {
      signature=nextSignature;
      for(const material of ownedMaterials)material.dispose();
      ownedMaterials.length=0;
      for(const texture of ownedTextures)texture.dispose();
      ownedTextures.length=0;
      labels.clear();
      rooms.clear(); structure.clear(); transport.clear(); roomViews.clear();
      for(const floor of world.floors) {
        const span=(floor.end-floor.start)*8;
        const mesh=new THREE.Mesh(box,new THREE.MeshStandardMaterial({color:0xcabfa8,roughness:0.9}));
        ownedMaterials.push(mesh.material);
        mesh.scale.set(span,4,12);
        mesh.position.set(floor.start*8+span/2,floor.floor*36-2,0);
        structure.add(mesh);
        const back=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({color:0x625b50}));
        ownedMaterials.push(back.material);
        back.scale.set(span,32,1);
        back.position.set(mesh.position.x,floor.floor*36-20,-6);
        structure.add(back);
      }
      for(const room of world.rooms) {
        if(room.type===2 || room.type>=19 && room.type<=23 || room.type===25)continue;
        let category='rooms',index=roomTiles[room.type];
        if(room.type===15){category='exterior-effects';index=10;}
        const sprite=art[category][index];
        const texture=sprite.texture.clone();
        ownedTextures.push(texture);
        const w=room.width*8-2,h=room.height*36-6;
        // Cover a room with a centered source crop; never distort the source aspect.
        const imageAspect=sprite.width/sprite.height,aspect=w/h;
        if(imageAspect>aspect){texture.repeat.x=aspect/imageAspect;texture.offset.x=(1-texture.repeat.x)/2;}
        else {texture.wrapS=THREE.RepeatWrapping;texture.repeat.x=aspect/imageAspect;}
        texture.needsUpdate=true;
        const material=new THREE.MeshBasicMaterial({map:texture,transparent:room.type===15});
        ownedMaterials.push(material);
        const mesh=new THREE.Mesh(plane,material);
        mesh.scale.set(w,h,1);
        mesh.position.set(room.x*8+room.width*4,(room.floor+room.height/2-1)*36-2,-3);
        rooms.add(mesh);roomViews.set(room.id,mesh);
        if(room.type>=3 && room.type<=12 && (room.state===0 || room.state===7)) {
          const label=document.createElement('canvas');label.width=256;label.height=64;
          const context=label.getContext('2d');context.fillStyle='#263d3b';context.fillRect(0,0,256,64);
          context.fillStyle='#f5deae';context.font='600 32px system-ui';context.textAlign='center';context.textBaseline='middle';
          let status='AVAILABLE';if(room.state===7)status='VACANT';context.fillText(status,128,32);
          const texture=new THREE.CanvasTexture(label);ownedTextures.push(texture);
          const material=new THREE.MeshBasicMaterial({map:texture,transparent:true});ownedMaterials.push(material);
          const notice=new THREE.Mesh(plane,material);notice.scale.set(Math.min(35,w-4),7,1);
          notice.position.set(mesh.position.x,mesh.position.y+2,8);rooms.add(notice);
        }
        const border=new THREE.Mesh(box,new THREE.MeshStandardMaterial({color:0xc7b79b,roughness:0.9}));
        ownedMaterials.push(border.material);
        border.scale.set(1.5,room.height*36-4,10);
        border.position.set(room.x*8,(room.floor+room.height/2-1)*36,1);
        structure.add(border);
        if(room.construction) {
          const panel=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({color:0xa68b5d,transparent:true,opacity:0.76}));
          ownedMaterials.push(panel.material);
          panel.scale.set(w,h,1);panel.position.copy(mesh.position);panel.position.z=4;
          rooms.add(panel);
          for(let i=0;i<w;i+=14) {
            const brace=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({color:0xe5c99a}));
            ownedMaterials.push(brace.material);
            brace.scale.set(1,h,1);brace.rotation.z=-0.25;
            brace.position.set(room.x*8+i+3,mesh.position.y,5);rooms.add(brace);
          }
        }
      }
      const annotations=world.floors.map(floor=>({x:floor.start*8-14,y:floor.floor*36-18,text:String(floor.floor)}));
      if(world.debug)for(const room of world.rooms)annotations.push({x:room.x*8+room.width*4,y:room.floor*36-12,text:String(room.id)});
      for(const annotation of annotations) {
        const label=document.createElement('canvas');label.width=192;label.height=64;
        const context=label.getContext('2d');
        context.font='500 36px system-ui';context.textAlign='center';context.textBaseline='middle';
        context.fillStyle='#162f32';context.fillText(annotation.text,96,32);
        const texture=new THREE.CanvasTexture(label);ownedTextures.push(texture);
        const material=new THREE.SpriteMaterial({map:texture,depthTest:false});ownedMaterials.push(material);
        const text=new THREE.Sprite(material);text.scale.set(27,9,1);text.position.set(annotation.x,annotation.y,15);labels.add(text);
      }
      for(const shaft of world.shafts) {
        const h=(shaft.hi-shaft.lo+1)*36;
        const center=shaft.x*8+shaft.width*4;
        const wall=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({color:0x343e3e,transparent:true,opacity:0.92}));
        ownedMaterials.push(wall.material);
        wall.scale.set(shaft.width*8,h,1);wall.position.set(center,(shaft.hi+shaft.lo-1)*18,0);
        wall.visible=!shaft.hidden;transport.add(wall);
        for(const x of [shaft.x*8+1,(shaft.x+shaft.width)*8-1]) {
          const rail=new THREE.Mesh(box,new THREE.MeshStandardMaterial({color:0xa1afa7,metalness:0.5,roughness:0.5}));
          ownedMaterials.push(rail.material);
          rail.scale.set(1.5,h,7);rail.position.set(x,wall.position.y,2);transport.add(rail);
        }
        for(const floor of [shaft.hi+1,shaft.lo-1]) {
          const material=new THREE.MeshBasicMaterial({map:art.rooms[15].texture});ownedMaterials.push(material);
          const cap=new THREE.Mesh(plane,material);
          let y=(shaft.lo-1)*36-5;if(floor>shaft.hi)y=shaft.hi*36+5;
          cap.scale.set(shaft.width*8,10,1);cap.position.set(center,y,3);transport.add(cap);
        }
      }
      for(const room of world.rooms) {
        if(room.type!==19 && room.type!==20 && room.type!==25)continue;
        let index=6;
        if(room.type===20)index=8;
        if(room.type===25)index=12;
        const sprite=art.transport[index];
        const material=new THREE.MeshBasicMaterial({map:sprite.texture,transparent:true});
        ownedMaterials.push(material);
        const mesh=new THREE.Mesh(plane,material);
        const h=room.height*36-5;
        const w=Math.min(room.width*8,h*sprite.width/sprite.height);
        mesh.scale.set(w,h,1);mesh.position.set(room.x*8+room.width*4,(room.floor+room.height/2-1)*36,5);
        transport.add(mesh);
      }
    }
    for(const room of world.rooms) {
      const mesh=roomViews.get(room.id);
      if(!mesh)continue;
      let light=1;
      if(!room.lit)light=0.58;
      if(room.burned)light=0.19;
      mesh.material.color.setRGB(light,light,light);
      if(world.mapMode>0) {
        let metric=room.evaluation/255;
        if(world.mapMode===2)metric=1-room.rent/3;
        if(world.mapMode===3)metric=Number(room.occupied>0);
        mesh.material.color.setHSL(Math.max(0,Math.min(1,metric))*0.32,0.45,0.62);
      }
    }
    const visiblePeople=new Set();
    for(const person of world.people) {
      visiblePeople.add(person.id);
      let row=0;
      if(person.frame>=30 && person.frame<57)row=1;
      if(person.kind==='cleaner')row=2;
      if(person.kind==='walking')row=1;
      if(person.vip)row=3;
      const sprite=art.people[row*6+Math.abs(person.frame)%6];
      let mesh=peopleViews.get(person.id);
      if(!mesh) {
        mesh=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({map:sprite.texture,transparent:true,depthWrite:false}));
        figures.add(mesh);peopleViews.set(person.id,mesh);
        mesh.position.set(person.x,person.y,9);
      }
      mesh.material.map=sprite.texture;
      const h=person.height*0.8,w=h*sprite.width/sprite.height;
      const px=person.x+person.width/2,py=person.y+h/2;
      mesh.userData={fromX:mesh.position.x,fromY:mesh.position.y,x:px,y:py,sampled:performance.now()};
      mesh.scale.set(w,h,1);
    }
    for(const [id,mesh] of peopleViews)if(!visiblePeople.has(id)) {
      figures.remove(mesh);mesh.material.dispose();peopleViews.delete(id);
    }
    const visibleCabins=new Set();
    for(const cabin of world.cabins) {
      visibleCabins.add(cabin.id);
      let index=0;
      if(cabin.occupancy>0)index=1;
      if(cabin.width>32)index=3;
      const sprite=art.transport[index];
      let mesh=cabinViews.get(cabin.id);
      if(!mesh) {
        mesh=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({map:sprite.texture,transparent:true}));
        for(const side of [-1,1]) {
          const door=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({color:0xa3aaa1,transparent:true,opacity:0.85}));
          door.position.set(side*0.12,-0.01,0.01);door.userData.side=side;mesh.add(door);
        }
        transport.add(mesh);cabinViews.set(cabin.id,mesh);mesh.position.y=cabin.y+cabin.height/2;
      }
      if(mesh.parent!==transport)transport.add(mesh);
      mesh.material.map=sprite.texture;
      for(const door of mesh.children) {
        const openness=Number(cabin.doors>0);
        door.scale.set(0.21*(1-openness),0.65,1);
        door.position.x=door.userData.side*(0.11+0.12*openness);
      }
      const h=Math.min(cabin.height,cabin.width*sprite.height/sprite.width);
      mesh.scale.set(cabin.width,h,1);
      mesh.position.x=cabin.x+cabin.width/2;mesh.position.z=6;
      mesh.userData={shaft:cabin.shaft,fromY:mesh.position.y,y:cabin.y+h/2,sampled:performance.now()};
    }
    for(const [id,mesh] of cabinViews)if(!visibleCabins.has(id)) {
      transport.remove(mesh);mesh.material.dispose();for(const door of mesh.children)door.material.dispose();cabinViews.delete(id);
    }
    const visibleEffects=new Set();
    for(const effect of world.effects) {
      const id=effect.kind+':'+effect.id;
      visibleEffects.add(id);
      const source={fire:['exterior-effects',7+effect.frame%3],crane:['transport',15],helicopter:['transport',14],santa:['transport',14],train:['transport',10],wedding:['people',18+effect.frame%6],find:['exterior-effects',13],guard:['people',18+effect.frame%6],'fire-escape':['transport',7],entrance:['exterior-effects',12],'parked-car':['transport',11],'garbage-truck':['transport',13]};
      const [category,index]=source[effect.kind];
      const sprite=art[category][index];
      let mesh=effectViews.get(id);
      if(!mesh) {
        mesh=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({map:sprite.texture,transparent:true,depthWrite:false}));
        effects.add(mesh);effectViews.set(id,mesh);
      }
      mesh.material.map=sprite.texture;
      const w=Math.min(effect.width,effect.height*sprite.width/sprite.height);
      const h=w*sprite.height/sprite.width;
      mesh.scale.set(w,h,1);mesh.position.set(effect.x+effect.width/2,effect.y+h/2,14);
      mesh.userData={kind:effect.kind,height:h};
    }
    for(const [id,mesh] of effectViews)if(!visibleEffects.has(id)) {
      effects.remove(mesh);mesh.material.dispose();effectViews.delete(id);
    }
    ghost.visible=Boolean(world.ghost.active);
    if(ghost.visible) {
      const data=world.ghost;
      ghost.scale.set(data.width*8,data.height*36,6);
      ghost.position.set(data.x*8+data.width*4,(data.floor+data.height/2-1)*36,10);
      ghost.material.color.setHex(0xec8c73);
      if(data.valid)ghost.material.color.setHex(0x87ddbd);
    }
  }
};
