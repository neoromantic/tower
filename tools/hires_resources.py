#!/usr/bin/env python3
"""Deterministic HD derivatives; run with uv run --with pillow python tools/hires_resources.py."""
import gzip
import hashlib
import json
import re
import struct
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SCALE = 4
main = (ROOT / 'src/main.c').read_text()
constants = {k: int(v, 0) for k, v in re.findall(r'^#define (SPR_\w+)\s+(0x[\da-fA-F]+|\d+)\b', main, re.M)}
widths = {k: int(v) for k, v in re.findall(r'case ITEM_(\w+):\s*\*frame_w = (\d+);', main)}
specs = json.loads((ROOT / 'data/art/sheets.json').read_text())

# This is an authoring boundary: only source plates enter HD pixels, never NE bitmaps.
def fit(art, w, h, cover=False):
    size = (w * SCALE, h * SCALE)
    if cover:
        return ImageOps.fit(art, size, Image.Resampling.LANCZOS)
    image = Image.new('RGBA', size)
    art = ImageOps.contain(art, size, Image.Resampling.LANCZOS)
    image.alpha_composite(art, ((size[0] - art.width) // 2, size[1] - art.height))
    return image

for style in ['schematic', 'modern-pixel', 'warm-dollhouse', 'miniature-3d']:
    root = ROOT / 'data/styles' / style
    coverage = json.loads((root / 'coverage.json').read_text())
    cells = {}
    hashes = {}
    for category, boxes in coverage['source_crops'].items():
        path = root / 'sources' / (category + '.png')
        # Use original warm rooms, before the historical anisotropic normalization.
        if style == 'warm-dollhouse' and category == 'rooms':
            path = root / 'sources/rooms.generated.png'
            boxes = [c['box'] for c in json.loads((root / 'sources/normalization.json').read_text())['rooms']['crops']]
        hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        plate = Image.open(path).convert('RGBA')
        cells[category] = []
        for n, box in enumerate(boxes):
            if style == 'warm-dollhouse' and category == 'rooms':
                crop = json.loads((root / 'sources/normalization.json').read_text())['rooms']['crops'][n]
                path = root / 'sources' / crop['source']
                hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
                plate = Image.open(path).convert('RGBA')
            art = plate.crop(box)
            if category not in ['rooms'] and not (category == 'exterior-effects' and len(cells[category]) < 3):
                for corner in [(0, 0), (art.width-1, 0), (0, art.height-1), (art.width-1, art.height-1)]:
                    if min(art.getpixel(corner)[:3]) > 220:
                        ImageDraw.floodfill(art, corner, (255, 255, 255, 0), thresh=50)
                art = art.crop(art.getbbox())
            cells[category].append(art)
    images = {}
    for spec in specs:
        fw = widths[spec['item']]
        rec = next(s for s in coverage['sprites'] if int(s['id'],16) == spec['rows'][0][0])
        h = rec['height'] * len(spec['rows'])
        sheet = Image.new('RGBA', (fw * spec['frames'] * SCALE, h * SCALE))
        for f in range(spec['frames']):
            art = fit(cells['rooms'][spec['tile']], fw, h, True)
            if f in spec['dark']:
                art = ImageEnhance.Brightness(art).enhance(.45)
            sheet.alpha_composite(art, (f * fw * SCALE, 0))
        x = 0
        for col, piece in enumerate(spec['pieces']):
            w = int(piece * fw)
            for row, ids in enumerate(spec['rows']):
                images[ids[col]] = sheet.crop((x*SCALE, row*h*SCALE//len(spec['rows']), (x+w)*SCALE, (row+1)*h*SCALE//len(spec['rows'])))
            x += w
    for rec in coverage['sprites']:
        rid = int(rec['id'],16)
        if rid in images or 'labels' in rec or 'ui_icons' in rec:
            continue
        w, h = rec['width'], rec['height']
        category = rec['source']
        if 0x8384 <= rid < 0x8388:
            row_h = h // 4
            image = Image.new('RGBA', (w * SCALE, h * SCALE))
            cloud = fit(cells['exterior-effects'][3], w, row_h)
            for row in range(4):
                image.alpha_composite(cloud, (0, row * row_h * SCALE))
        elif 'chunks' in rec:
            image = Image.new('RGBA', (w*SCALE, h*SCALE))
            for x in range(0, w, 328):
                image.alpha_composite(fit(cells['rooms'][12],328,h,True), (x*SCALE,0))
        elif 'sheet_crop' in rec:
            # One registered staircase in each 64x72 frame; split only afterwards.
            frames = rec['frames']
            image = Image.new('RGBA', (frames*64*SCALE,72*SCALE))
            stair = fit(cells[category][rec['cells'][0]],64,72)
            for f in range(frames):
                image.alpha_composite(stair,(f*64*SCALE,0))
                if f:
                    pose = fit(cells['people'][f%6],8,20)
                    step = f*5%48
                    image.alpha_composite(pose,((f*64+step)*SCALE,(48-step)*SCALE))
            image = image.crop(tuple(v*SCALE for v in rec['sheet_crop']))
        elif 'scene_crop' in rec:
            height = 216
            if rec['daynight']:
                height = 180
            scene = fit(cells[category][rec['cells'][0]],224,height)
            image = scene.crop(tuple(v*SCALE for v in rec['scene_crop']))
            if rec['daynight']:
                night = ImageEnhance.Brightness(image).enhance(.55)
                pair = Image.new('RGBA',(w*SCALE,h*SCALE))
                pair.alpha_composite(image,(0,0)); pair.alpha_composite(night,(224*SCALE,0))
                image = pair
        else:
            frames = rec.get('frames',1)
            if rid == 0x87E8:
                frames = 12
            stride = w//frames
            image = Image.new('RGBA',(w*SCALE,h*SCALE))
            # Shared bounds and bottom-center registration across all six poses.
            art_cells = [cells[category][n] for n in rec['cells']]
            factor = min(stride*SCALE/max(a.width for a in art_cells), h*SCALE/max(a.height for a in art_cells))
            for f in range(frames):
                art = art_cells[f%len(art_cells)]
                if category == 'people':
                    art = art.resize((round(art.width*factor),round(art.height*factor)),Image.Resampling.LANCZOS)
                    image.alpha_composite(art,(f*stride*SCALE+(stride*SCALE-art.width)//2,h*SCALE-art.height))
                else:
                    image.alpha_composite(fit(art,stride,h, category=='rooms' or (category=='exterior-effects' and rec['cells'][0]<3)),(f*stride*SCALE,0))
                if rid in [0x87E9,0x87EA,0x87EC]:
                    label = str(f)
                    if rid == 0x87EA:
                        label = ['B1','B2','B','1','2','3','4','5','6','7','8','9'][f]
                    ImageDraw.Draw(image).text(((f*stride+1)*SCALE,16*SCALE),label,fill='white',font=ImageFont.load_default(size=12*SCALE))
        images[rid] = image
    # HD palette animation uses deterministic source brightness, never NE palette pixels.
    for a,b in [(0x8429,0xF829),(0x8429,0xF929),(0x842B,0xF82B),(0x842B,0xF92B),(0x8768,0xF768),(0x8868,0xF868)]:
        images[b] = ImageEnhance.Brightness(images[a]).enhance(.85)
    # Reproduce the existing composition graph on metadata (no texture readback).
    regions = {}
    tiles, seen = [], {}
    for rid,image in images.items():
        regions[rid] = []
        w,h = image.width//SCALE,image.height//SCALE
        for y in range(0,h,36):
            for x in range(0,w,64):
                tw,th = min(64,w-x),min(36,h-y)
                tile = image.crop((x*SCALE,y*SCALE,(x+tw)*SCALE,(y+th)*SCALE))
                key = (tile.size,hashlib.sha256(tile.tobytes()).digest())
                if key not in seen:
                    seen[key] = len(tiles); tiles.append(tile)
                regions[rid].append((x,y,tw,th,seen[key]))
    dims = {rid:(im.width//SCALE,im.height//SCALE) for rid,im in images.items()}
    def compose(a,b,c,vertical):
        wa,ha=dims[a]; wb,hb=dims[b]
        dx,dy=wa,0
        if vertical: dx,dy=0,ha
        regions[c]=regions[a]+[(x+dx,y+dy,w,h,t) for x,y,w,h,t in regions[b]]
        dims[c]=(max(wa,wb),ha+hb)
        if not vertical: dims[c]=(wa+wb,max(ha,hb))
    # Literal calls and named numeric constants from the actual engine graph.
    for direction,a,b,c in re.findall(r'sprites_compose_([hv])\(&game.sprites, game.renderer,\s*(\w+),\s*(\w+),\s*(\w+)\)',main):
        ids = dict(constants)
        ids.update({v: int(v,16) for v in (a,b,c) if v.startswith('0x')})
        a,b,c = [ids.get(v) for v in (a,b,c)]
        if a in regions and b in regions and c is not None: compose(a,b,c,direction=='v')
    for v in range(5):
        compose(0x8568+2*v,0x8569+2*v,constants['SPR_RESTAURANT_V0']+v,False)
        compose(0x86E8+2*v,0x86E9+2*v,constants['SPR_FASTFOOD_V0']+v,False)
        compose(0x88E9+v,0x8929+v,0xE0+v,True)
    for a,b,c in [(0xE0,0xE1,0xE5),(0xE5,0xE2,0xE6),(0xE6,0xE3,0xE7),(0xE7,0xE4,constants['SPR_RECYCLING_COMP']), (0x8728,0x8729,0xFF),(0xFF,0x872A,constants['SPR_MEDICAL_COMP']), (0x8EE8,0x8EE9,0xEF),(0xEF,0x8EEA,constants['SPR_RAMP_COMP']), (0x8BA8,0x8BA9,0xF0),(0x8BE8,0x8BE9,0xF1),(0x8C28,0x8C29,0xF2)]: compose(a,b,c,False)
    compose(0xF0,0xF1,0xF3,True); compose(0xF3,0xF2,constants['SPR_METRO_COMP'],True)
    # Shelf packing: 2048 maximum physical dimension; only one style lives on GPU.
    pages=[]; positions=[None]*len(tiles); x=y=rowh=0
    page=Image.new('RGBA',(2048,2048))
    for index in sorted(range(len(tiles)), key=lambda i: -tiles[i].height):
        tile = tiles[index]
        # A replicated physical-pixel gutter prevents neighboring-tile sampling.
        padded = Image.new('RGBA', (tile.width+2, tile.height+2))
        padded.paste(tile,(1,1))
        padded.paste(tile.crop((0,0,1,tile.height)),(0,1))
        padded.paste(tile.crop((tile.width-1,0,tile.width,tile.height)),(tile.width+1,1))
        padded.paste(padded.crop((0,1,padded.width,2)),(0,0))
        padded.paste(padded.crop((0,tile.height,padded.width,tile.height+1)),(0,tile.height+1))
        tile = padded
        if x+tile.width>2048: x=0; y+=rowh; rowh=0
        if y+tile.height>2048:
            pages.append(page.crop((0,0,2048,y+rowh))); page=Image.new('RGBA',(2048,2048)); x=y=rowh=0
        positions[index] = (len(pages),x+1,y+1)
        page.paste(tile,(x,y)); x+=tile.width; rowh=max(rowh,tile.height)
    pages.append(page.crop((0,0,2048,y+rowh)))
    out=root/'hd'; out.mkdir(exist_ok=True)
    with (out/'world.gz').open('wb') as raw, gzip.GzipFile(filename='', fileobj=raw, mode='wb', compresslevel=9, mtime=0) as f:
        f.write(struct.pack('<III',len(pages),len(regions),SCALE))
        for page in pages:
            f.write(struct.pack('<II',*page.size)); f.write(page.tobytes())
        for rid,rs in sorted(regions.items()):
            f.write(struct.pack('<II',rid,len(rs)))
            for x,y,w,h,t in rs: f.write(struct.pack('<7i',x,y,w,h,*positions[t]))
    (out/'provenance.json').write_text(json.dumps(dict(scale=SCALE,sources=hashes,operation='LANCZOS cover for room footprints; contain for objects; bottom-center registered people; deduplicated 64x36 logical tiles; metadata composites',tiles=len(tiles),pages=[p.size for p in pages],gpu_bytes=sum(p.width*p.height*4 for p in pages),sha256=hashlib.sha256((out/'world.gz').read_bytes()).hexdigest()),indent=2)+'\n')
    print(style,len(tiles),'tiles',sum(p.width*p.height*4 for p in pages)//1024**2,'MiB GPU',(out/'world.gz').stat().st_size)
