#!/usr/bin/env python3
"""Build original resources: uv run --with pillow==12.0.0 python tools/generate_resources.py."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps
from sound_resources import SOUNDS, TEXTS

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'data/art'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--style', choices=['schematic', 'modern-pixel', 'warm-dollhouse', 'miniature-3d'])
args = parser.parse_args()
destination = ROOT / 'data'
room_source = ART / 'interiors.png'
coverage = {}
source_crops = {}
key_masks = {}
if args.style:
    destination = ROOT / 'data/styles' / args.style
    room_source = destination / 'sources/rooms.png'
main = (ROOT / 'src/main.c').read_text()
tower = (ROOT / 'src/tower.h').read_text()
frame_widths = {name: int(width) for name, width in re.findall(
    r'case ITEM_(\w+):\s*\*frame_w = (\d+);', main)}
cell_h = int(re.search(r'#define CELL_H\s+(\d+)', tower)[1])
tenant_h = int(re.search(r'#define TENANT_H\s+(\d+)', tower)[1])
heights = dict((name, int(height)) for name, height in re.findall(
    r'\[ITEM_(\w+)\] = (\d+)', tower.split('ITEM_HEIGHT[] = {')[1].split('};')[0]))
# This palette is self-authored; reserved entries match sprites.c's cycle/key contract.
colors = [(255, 255, 255), (31, 45, 52), (67, 86, 90), (100, 133, 132),
          (44, 110, 110), (85, 155, 151), (174, 209, 199), (244, 232, 203),
          (218, 203, 170), (163, 133, 96), (217, 159, 55), (248, 197, 81),
          (178, 77, 49), (121, 74, 64), (230, 230, 230), (25, 25, 25),
          (138, 212, 255), (216, 236, 237), (74, 180, 255)]
colors += [(31, 45, 52)] * (256 - len(colors))
colors[197:204] = [(248, 197, 81), (178, 77, 49), (44, 110, 110),
                   (174, 209, 199), (217, 159, 55), (244, 232, 203), (85, 155, 151)]
palette = Image.new('P', (1, 1))
palette.putpalette([c for rgb in colors for c in rgb])
source = Image.open(room_source).convert('RGB')
tiles = []
source_crops['rooms'] = []
for i in range(16):
    x, y = i % 2 * source.width // 2, i // 2 * source.height // 8
    bottom = y + source.height // 8
    if args.style == 'miniature-3d':
        bands = [0, 144, 284, 416, 545, 678, 796, 906, 1024]
        y, bottom = bands[i // 2:i // 2 + 2]
    source_crops['rooms'].append([x, y, x + source.width // 2, bottom])
    tiles.append(source.crop(source_crops['rooms'][-1]))
images = {}
raw_ids = set()
# id, item geometry, atlas tile, frames, horizontal pieces, vertical resource rows.
for spec in json.loads((ART / 'sheets.json').read_text()):
    item, tile, frames, pieces, rows = spec['item'], spec['tile'], spec['frames'], spec['pieces'], spec['rows']
    fw = frame_widths[item]
    h = tenant_h
    if heights[item] > 1:
        h = heights[item] * cell_h
    sheet = Image.new('RGB', (fw * frames, h))
    for f in range(frames):
        room = tiles[tile].resize((fw, h), Image.Resampling.NEAREST)
        if f in spec['dark']:
            room = ImageEnhance.Brightness(room).enhance(0.45)
        sheet.paste(room, (f * fw, 0))
        draw = ImageDraw.Draw(sheet)
        # Increasing occupancy/state marks, while retaining the original generated art.
        for p in range(f % 4):
            x = f * fw + 6 + p * 9
            draw.rectangle((x, h - 10, x + 2, h - 4), fill=colors[4])
            draw.rectangle((x, h - 13, x + 2, h - 11), fill=colors[9])
    xcuts = [0]
    for width in pieces:
        xcuts.append(xcuts[-1] + int(width * fw))
    assert xcuts[-1] == sheet.width
    for row, ids in enumerate(rows):
        for col, rid in enumerate(ids):
            images[rid] = sheet.crop((xcuts[col], row * h // len(rows), xcuts[col + 1], (row + 1) * h // len(rows)))
            coverage[rid] = dict(source='rooms', cells=[tile], frames=frames, dark=spec['dark'],
                                 sheet_crop=[xcuts[col], row * h // len(rows), xcuts[col + 1], (row + 1) * h // len(rows)])

# CGPK is eight-pixel columns of 36 top-down rows, NOT a linear raster.
for base, chunks in [(0x89E8, 3), (0x8A28, 2), (0x8A68, 1)]:
    for v in range(3):
        rid = base + v
        image = Image.new('RGB', (chunks * 328, cell_h), colors[7])
        for chunk in range(chunks):
            image.paste(tiles[12].resize((328, cell_h), Image.Resampling.NEAREST), (chunk * 328, 0))
        images[rid] = image
        raw_ids.add(rid)
        coverage[rid] = dict(source='rooms', cells=[12], chunks=chunks, variant=v)

# Animated figures, queue silhouettes, popup portraits, emergency and wedding sheets.
people = [(0x8468, 40, 16, 36, 0), (0x8469, 10, 16, 36, 0),
          (0x82BC, 12, 8, 24, 14), (0x82BE, 12, 8, 24, 14), (0x82BF, 12, 8, 24, 14),
          (0x8828, 8, 16, 36, 0)]
people += [(0x85E8 + i, count, 16, 24, 0) for i, count in enumerate([30, 27, 6, 10, 7, 16, 3])]
for rid, count, stride, h, bg in people:
    image = Image.new('RGB', (count * stride, h), colors[bg])
    draw = ImageDraw.Draw(image)
    for f in range(count):
        x, y = f * stride + stride // 2, h - 15
        draw.rectangle((x - 1, y, x + 1, y + 3), fill=colors[9])
        draw.rectangle((x - 2, y + 4, x + 2, y + 10), fill=colors[1 + f % 5])
        draw.line((x - 1, y + 11, x - 2 + f % 3, h - 2), fill=colors[1], width=2)
        draw.line((x + 1, y + 11, x + 2 - f % 3, h - 2), fill=colors[1], width=2)
    images[rid] = image

# Cars have 5 fullness states; engines occupy the last two frames.
for rid, fw, count, engine in [(0x8428, 32, 1, 1), (0x8429, 32, 6, 4),
                                (0x842A, 32, 5, 5), (0x842B, 48, 7, 5)]:
    image = Image.new('RGB', (fw * count, cell_h), colors[2])
    draw = ImageDraw.Draw(image)
    for f in range(count):
        x = f * fw
        draw.rectangle((x + 2, 3, x + fw - 3, 33), fill=colors[6], outline=colors[1])
        if f >= engine:
            image.paste(tiles[15].resize((fw - 4, 30), Image.Resampling.NEAREST), (x + 2, 3))
        else:
            draw.line((x + fw // 2, 5, x + fw // 2, 32), fill=colors[2])
            for p in range(f):
                px = x + 5 + p * 5
                draw.rectangle((px, 16, px + 2, 27), fill=colors[1])
    images[rid] = image

for rid, w in [(0x842C, 16), (0x87E8, 192)]:
    image = Image.new('RGB', (w, 36), colors[2])
    draw = ImageDraw.Draw(image)
    for x in range(0, w, 8):
        draw.line((x, 0, x, 35), fill=colors[1])
        draw.line((x + 3, 0, x + 3, 35), fill=colors[3])
    images[rid] = image

for rid, count in [(0x87E9, 10), (0x87EA, 12), (0x87EC, 10)]:
    image = Image.new('RGB', (count * 16, 36), colors[15])
    draw = ImageDraw.Draw(image)
    for n in range(count):
        label = str(n)
        if rid == 0x87EA:
            label = ['B1', 'B2', 'B', '1', '2', '3', '4', '5', '6', '7', '8', '9'][n]
        ink = colors[7]
        if rid == 0x87EC:
            ink = colors[12]
        draw.text((n * 16 + 1, 16), label, fill=ink, font=ImageFont.load_default(size=14))
    images[rid] = image

# Diagonal transport strips: normal stairs = 11 frames, escalator = 12.
for ids, frames in [([0x8968, 0x89A8, 0x8969, 0x89A9], 11), ([0x8AA8, 0x8AE8], 12),
                     ([0x8FE9], 69), ([0x8FEA], 92)]:
    full = Image.new('RGB', (frames * 64, 72), colors[0])
    draw = ImageDraw.Draw(full)
    for f in range(frames):
        x = f * 64
        draw.line((x, 69, x + 63, 3), fill=colors[1], width=5)
        draw.line((x, 58, x + 63, 0), fill=colors[4], width=2)
        for n in range(0, 64, 6):
            y = 69 - n
            draw.line((x + n, y, x + n + 5, y), fill=colors[10], width=2)
        if f:
            px = x + (f * 5 % 56) + 3
            py = 60 - (px - x)
            draw.rectangle((px, py - 8, px + 2, py), fill=colors[4])
    for i, rid in enumerate(ids):
        if rid >= 0x8FE9:
            images[rid] = full.crop((0, 0, frames * 64, 36))
            raw_ids.add(rid)
        else:
            # Two stairs sheets compose horizontally into the 11-frame strip.
            start, end = 0, frames * 64
            if len(ids) == 4:
                start, end = (i // 2) * 384, min((i // 2 + 1) * 384, frames * 64)
            images[rid] = full.crop((start, (i % 2) * 36, end, (i % 2 + 1) * 36))

# Exterior schematic artwork, authored here from geometry, never sampled from another game.
for i, (w, h) in enumerate([(96, 41), (192, 19), (292, 38), (216, 43)]):
    image = Image.new('RGB', (w, h), colors[0])
    h //= 4
    draw = ImageDraw.Draw(image)
    for row in range(4):
        for n in range(5):
            x = n * (w - 30) // 5
            y = row * h + h // 4 + (n % 2) * h // 6
            draw.ellipse((x, y, min(x + w // 2, w - 1), row * h + h - 2), fill=colors[17])
    images[0x8384 + i] = image

image = Image.new('RGB', (96, 55), colors[16])
draw = ImageDraw.Draw(image)
for n in range(12):
    x, y = n * 8, 8 + n * 13 % 35
    draw.rectangle((x, y, x + 7, 54), fill=colors[3])
    for wy in range(y + 4, 50, 7):
        draw.rectangle((x + 2, wy, x + 3, wy + 2), fill=colors[6])
images[0x8389] = image
for i in range(11):
    images[0x8351 + i] = Image.new('RGB', (32, 360), colors[16])
images[0x83E8] = Image.new('RGB', (96, 36), colors[2])
ImageDraw.Draw(images[0x83E8]).rectangle((0, 0, 95, 11), fill=colors[8])
images[0x8F28] = Image.new('RGB', (32, 36), colors[1])
ImageDraw.Draw(images[0x8F28]).rectangle((0, 27, 31, 29), fill=colors[3])
for i in range(4):
    image = Image.new('RGB', (96, 36), colors[0])
    draw = ImageDraw.Draw(image)
    for x in range(0, 96, 8):
        peak = 4 + (x * 3 + i * 7) % 17
        draw.polygon([(x, 35), (x + 2, peak + 7), (x + 4, peak), (x + 7, 35)], fill=colors[12])
        draw.polygon([(x + 2, 35), (x + 4, peak + 10), (x + 6, 35)], fill=colors[11])
    images[0x8F68 + i] = image

for rid, w, h in [(0x8388, 140, 48), (0x8F6D, 96, 36), (0xA711, 96, 36), (0xA712, 96, 36),
                   (0x83E9, 112, 24), (0x83EA, 128, 72), (0x842D, 32, 36),
                   (0x8E28, 64, 36), (0x8E29, 64, 36), (0x8FA8, 96, 36), (0x892E, 96, 36)]:
    image = Image.new('RGB', (w, h), colors[0])
    draw = ImageDraw.Draw(image)
    if rid in [0x8388, 0x8F6D, 0xA711]:
        draw.ellipse((w // 4, h // 3, w * 3 // 4, h * 3 // 4), fill=colors[4], outline=colors[1])
        draw.line((4, h // 4, w - 4, h // 4), fill=colors[1], width=2)
        draw.line((w // 2, h // 4, w // 2, h // 2), fill=colors[1], width=2)
        draw.polygon([(w // 4, h // 2), (2, h // 3), (4, h * 2 // 3)], fill=colors[10])
    elif rid == 0x83EA:
        draw.line((w // 2, h - 1, w // 2, 4, 4, 4, w - 1, 4), fill=colors[10], width=3)
        draw.line((w - 10, 5, w - 10, h // 2), fill=colors[1], width=1)
    elif rid == 0x83E9:
        for x in range(0, w, 8):
            draw.rectangle((x, 2, x + 6, 12), fill=colors[4 + x % 2])
    elif rid in [0xA712, 0x892E]:
        draw.rectangle((8, 8, w - 8, h - 8), fill=colors[4], outline=colors[1])
        for x in [w // 4, w * 3 // 4]:
            draw.ellipse((x - 5, h - 12, x + 5, h - 2), fill=colors[1])
    else:
        for x in range(0, w, 8):
            draw.line((x, 0, x, h - 1), fill=colors[3])
        for y in range(0, h, 8):
            draw.line((0, y, w - 1, y), fill=colors[8])
    images[rid] = image

# Cathedral silhouette: day/night halves plus a six-strip ceremony state.
for ceremony in [False, True]:
    h = 180 + 36 * ceremony
    image = Image.new('RGB', (224, h), colors[18])
    draw = ImageDraw.Draw(image)
    top = 36 * ceremony
    draw.rectangle((24, top + 65, 200, h - 1), fill=colors[7], outline=colors[1], width=2)
    draw.ellipse((52, top + 3, 172, top + 115), fill=colors[4], outline=colors[1], width=2)
    draw.rectangle((52, top + 60, 172, h - 1), fill=colors[7])
    for x in range(40, 201, 24):
        draw.rectangle((x, top + 90, x + 7, h - 1), fill=colors[8])
    draw.rectangle((96, h - 38, 128, h - 1), fill=colors[4])
    if ceremony:
        draw.rectangle((20, 8, 204, 28), fill=colors[10], outline=colors[1])
        draw.text((57, 12), 'CELEBRATE', fill=colors[1])
    for row in range(h // 36):
        strip = image.crop((0, row * 36, 224, (row + 1) * 36))
        rid = 0x8CE8 + row * 0x40 + int(ceremony)
        if row == 5:
            rid = 0x8DEA
        if not ceremony:
            daynight = Image.new('RGB', (448, 36))
            daynight.paste(strip, (0, 0))
            night = ImageEnhance.Brightness(strip).enhance(0.55)
            # The exact sky key remains unchanged at night.
            pixels = night.load()
            for y in range(36):
                for x in range(224):
                    if strip.getpixel((x, y)) == colors[18]:
                        pixels[x, y] = colors[18]
            daynight.paste(night, (224, 0))
            strip = daynight
        images[rid] = strip

# Screen overlays consumed by cinema composites.
for top, bottom in [(0x8C68, 0x8CA8), (0x8C69, 0x8CA9)]:
    for rid in [top, bottom]:
        images[rid] = tiles[10].resize((192, 36), Image.Resampling.NEAREST)

# UI bitmap dimensions are the renderer's native crop contract.
ui = json.loads((ART / 'ui.json').read_text())
for spec in ui:
    rid, w, h = spec['id'], spec['width'], spec['height']
    image = Image.new('RGB', (w, h), colors[7])
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, w - 1, h - 1), outline=colors[2])
    for x, y, label in spec['labels']:
        draw.text((x, y), label, fill=colors[1])
    if 0x812C <= rid <= 0x812E:
        for n in range(26):
            x, y = n % 8 * 32, n // 8 * 32
            image.paste(tiles[n % 16].resize((28, 20), Image.Resampling.NEAREST), (x + 2, y + 6))
            draw.rectangle((x, y, x + 31, y + 31), outline=colors[2])
    if rid in [0x8142, 0x8143, 0xA716]:
        cx, cy = w // 2, h // 2
        points = []
        for p in range(10):
            radius = min(w, h) * [0.46, 0.21][p % 2]
            angle = -math.pi / 2 + p * math.pi / 5
            points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
        draw.polygon(points, fill=colors[10 + (rid == 0x8143) * -7], outline=colors[1])
    if rid in [0xA710, 0xA714]:
        draw.polygon([(w // 2, 4), (w - 5, h - 5), (5, h - 5)], fill=colors[10], outline=colors[1])
        draw.text((w // 2 - 3, h // 2), '!', fill=colors[1])
    images[rid] = image

# The legacy authoring above defines the resource geometry; style packs replace every
# non-room pixel below. No baseline drawing enters a themed output.
if args.style:
    cells = {'rooms': tiles}
    for category, columns, rows in [('people', 6, 4), ('transport', 4, 4),
                                    ('exterior-effects', 4, 4), ('ui', 4, 4)]:
        plate = Image.open(destination / 'sources' / (category + '.png')).convert('RGBA')
        cells[category] = []
        source_crops[category] = []
        for n in range(columns * rows):
            x, y = n % columns * plate.width // columns, n // columns * plate.height // rows
            source_crops[category].append([x, y, x + plate.width // columns, y + plate.height // rows])
            crop = plate.crop(source_crops[category][-1])
            if category != 'exterior-effects' or n >= 3:
                # Edge-connected white only: preserve enclosed white clothing/details.
                for corner in [(0, 0), (crop.width - 1, 0), (0, crop.height - 1),
                               (crop.width - 1, crop.height - 1)]:
                    if min(crop.getpixel(corner)[:3]) > 220:
                        ImageDraw.floodfill(crop, corner, (255, 255, 255, 0), thresh=50)
            cells[category].append(crop)

    # Expand source sequential poses into each native strip, including portrait keys.
    for rid, count, stride, h, bg in people:
        row = 0
        if rid in [0x82BE, 0x85E9, 0x85EB, 0x85ED]:
            row = 1
        if rid in [0x85EC, 0x85EE]:
            row = 2
        if rid in [0x82BF, 0x8469, 0x8828]:
            row = 3
        image = Image.new('RGBA', images[rid].size)
        for f in range(count):
            pose = cells['people'][row * 6 + f % 6]
            pose = ImageOps.contain(pose.crop(pose.getbbox()), (stride, h), Image.Resampling.NEAREST)
            image.alpha_composite(pose, (f * stride + (stride - pose.width) // 2, h - pose.height))
        images[rid] = image
        coverage[rid] = dict(source='people', cells=list(range(row * 6, row * 6 + 6)),
                             frames=count, stride=stride, sequence='frame modulo six', key=bg)

    for rid, fw, count, engine in [(0x8428, 32, 1, 1), (0x8429, 32, 6, 4),
                                   (0x842A, 32, 5, 5), (0x842B, 48, 7, 5)]:
        image = Image.new('RGBA', images[rid].size)
        states = []
        for f in range(count):
            cell = min(f, 2)
            if rid == 0x842B:
                cell = 3
            if f >= engine:
                cell = 4
            states.append(cell)
            car = cells['transport'][cell]
            car = ImageOps.contain(car.crop(car.getbbox()), (fw, cell_h), Image.Resampling.NEAREST)
            image.alpha_composite(car, (f * fw + (fw - car.width) // 2, cell_h - car.height))
            # Five native fullness states: generated passengers on generated car art.
            if f < engine:
                for person in range(f):
                    pose = cells['people'][person % 6]
                    pose = ImageOps.contain(pose.crop(pose.getbbox()), (5, 15), Image.Resampling.NEAREST)
                    image.alpha_composite(pose, (f * fw + 3 + person * (fw - 8) // 5, 16))
        images[rid] = image
        coverage[rid] = dict(source='transport', cells=states, frames=count, stride=fw,
                             people='people row 0 sequential poses', key=2)

    for ids, frames in [([0x8968, 0x89A8, 0x8969, 0x89A9], 11),
                         ([0x8AA8, 0x8AE8], 12), ([0x8FE9], 69), ([0x8FEA], 92)]:
        cell = 6
        if frames == 12:
            cell = 8
        full = Image.new('RGBA', (frames * 64, 72))
        stair = cells['transport'][cell]
        stair = stair.crop(stair.getbbox()).resize((64, 72), Image.Resampling.NEAREST)
        for f in range(frames):
            full.alpha_composite(stair, (f * 64, 0))
            if f:
                pose = cells['people'][f % 6]
                pose = ImageOps.contain(pose.crop(pose.getbbox()), (8, 20), Image.Resampling.NEAREST)
                step = f * 5 % 48
                full.alpha_composite(pose, (f * 64 + step, 48 - step))
        for i, rid in enumerate(ids):
            start, end = 0, frames * 64
            if len(ids) == 4:
                start, end = (i // 2) * 384, min((i // 2 + 1) * 384, frames * 64)
            top = i % 2 * 36
            images[rid] = full.crop((start, top, end, top + 36))
            coverage[rid] = dict(source='transport', cells=[cell], frames=frames,
                                 sheet_crop=[start, top, end, top + 36],
                                 people='people row 0 sequential poses on diagonal', key=0)

    # Categorical one-cell scenery, infrastructure, effects and UI surfaces.
    mapping = {0x842C: ('transport', 5), 0x87E8: ('transport', 5),
               0x8389: ('exterior-effects', 4), 0x83E8: ('exterior-effects', 5),
               0x8F28: ('exterior-effects', 6), 0x8388: ('transport', 14),
               0x8F6D: ('transport', 14), 0xA711: ('transport', 14),
               0xA712: ('transport', 13), 0x83E9: ('exterior-effects', 12),
               0x83EA: ('transport', 15), 0x842D: ('transport', 7),
               0x8E28: ('transport', 15), 0x8E29: ('transport', 15),
               0x8FA8: ('exterior-effects', 6), 0x892E: ('transport', 11),
               0x8EE8: ('transport', 12), 0x8EE9: ('transport', 12), 0x8EEA: ('transport', 12)}
    for i in range(4):
        mapping[0x8384 + i] = ('exterior-effects', 3)
        mapping[0x8F68 + i] = ('exterior-effects', 7 + i % 3)
    for i in range(11):
        mapping[0x8351 + i] = ('exterior-effects', min(i * 3 // 11, 2))
    for rid in [0x8C68, 0x8CA8, 0x8C69, 0x8CA9]:
        mapping[rid] = ('rooms', 10)
    for rid, (category, cell) in mapping.items():
        art = cells[category][cell]
        if category not in ['rooms'] and not (category == 'exterior-effects' and cell < 3):
            art = art.crop(art.getbbox())
        images[rid] = art.resize(images[rid].size, Image.Resampling.NEAREST).convert('RGBA')
        coverage[rid] = dict(source=category, cells=[cell], operation='crop alpha bounds and resize', key=0)
        if rid == 0x8389:
            coverage[rid]['key'] = 16
        if rid in [0x842C, 0x87E8]:
            coverage[rid]['key'] = 2

    for spec in json.loads((ART / 'sheets.json').read_text()):
        if spec['item'] != 'METRO':
            continue
        fw, h = frame_widths['METRO'], heights['METRO'] * cell_h
        sheet = Image.new('RGBA', (fw * spec['frames'], h))
        for f in range(spec['frames']):
            sheet.paste(tiles[11].resize((fw, h), Image.Resampling.NEAREST), (f * fw, 0))
            train = cells['transport'][10]
            train = ImageOps.contain(train.crop(train.getbbox()), (fw, h // 2), Image.Resampling.NEAREST)
            sheet.alpha_composite(train, (f * fw + f * 8, h - train.height))
        for row, ids in enumerate(spec['rows']):
            for col, rid in enumerate(ids):
                box = (int(col * fw * 1.5), row * h // 3, int((col + 1) * fw * 1.5), (row + 1) * h // 3)
                images[rid] = sheet.crop(box)
                coverage[rid] = dict(source='rooms', cells=[11], transport_cell=10,
                                     sheet_crop=box, frames=spec['frames'], key=0)

    # Reconstruct both cathedral composites from complete generated scenes.
    for ceremony in [False, True]:
        cell = 10 + int(ceremony)
        h = 180 + 36 * ceremony
        scene = cells['exterior-effects'][cell]
        scene = scene.crop(scene.getbbox()).resize((224, h), Image.Resampling.NEAREST)
        for row in range(h // 36):
            rid = 0x8CE8 + row * 0x40 + int(ceremony)
            if row == 5:
                rid = 0x8DEA
            strip = scene.crop((0, row * 36, 224, (row + 1) * 36))
            if not ceremony:
                daynight = Image.new('RGBA', (448, 36))
                daynight.paste(strip, (0, 0))
                night = ImageEnhance.Brightness(strip).enhance(0.55)
                night.putalpha(strip.getchannel('A'))
                daynight.paste(night, (224, 0))
                strip = daynight
            images[rid] = strip
            coverage[rid] = dict(source='exterior-effects', cells=[cell],
                                 scene_crop=[0, row * 36, 224, (row + 1) * 36], daynight=not ceremony, key=18)

    # Retain native UI labels and icon slots; draw on thematic room wall surfaces.
    for spec in ui:
        rid, w, h = spec['id'], spec['width'], spec['height']
        surface = tiles[12].resize((1, 1), Image.Resampling.BOX).resize((w, h), Image.Resampling.NEAREST)
        if rid in [0x8142, 0x8143, 0xA716, 0xA710, 0xA714]:
            cell = 15
            if rid in [0xA710, 0xA714]:
                cell = 14
            surface = cells['exterior-effects'][cell].resize((w, h), Image.Resampling.NEAREST)
            coverage[rid] = dict(source='exterior-effects', cells=[cell], key=0)
        else:
            coverage[rid] = dict(source='rooms', cells=[12], operation='average generated lobby colors into UI surface',
                                 labels=spec['labels'], ui_icons=rid in [0x812C, 0x812D, 0x812E])
        image = surface.convert('RGBA')
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, w - 1, h - 1), outline=colors[2])
        # Geometry aligns with the renderer's interactive subrectangles.
        if rid in [0x8190, 0x8191]:
            for box in [(28, 2, 99, 19), (101, 2, 170, 19), (76, 93, 120, 114),
                        (76, 148, 120, 169), (16, 399, 86, 423), (135, 399, 180, 423)]:
                draw.rectangle(box, outline=colors[2])
            for x in range(18, 137, 13):
                draw.line((x, 195, x, 390), fill=colors[3])
            for y in range(195, 391, 13):
                draw.line((18, y, 135, y), fill=colors[3])
            for n in range(6):
                draw.rectangle((14 + n * 28, 43, 40 + n * 28, 66), outline=colors[2])
        if rid in [0x81F4, 0x81F5]:
            for y in [60, 230, 300, 327]:
                draw.line((7, y, w - 8, y), fill=colors[3])
            draw.line((194, 60, 194, 230), fill=colors[3])
            draw.rectangle((156, 329, 193, 350), outline=colors[2])
        if rid in [0x819A, 0x819B]:
            draw.rectangle((14, 399, 84, 423), outline=colors[2])
        if rid == 0x8141:
            draw.ellipse((0, 0, w - 1, h - 1), outline=colors[2])
        for x, y, label in spec['labels']:
            draw.text((x, y), label, fill=colors[1])
        if 0x812C <= rid <= 0x812E:
            icon_cells = [11, 11, 15, 15, 14, 14, 14, 0, 2, 2, 2, 4, 4, 3, 9, 8, 12, 12, 13, 10, 8, 11, 5, 7, 1, 6]
            for n, cell in enumerate(icon_cells):
                x, y = n % 8 * 32, n // 8 * 32
                icon = cells['ui'][cell]
                if n == 1:
                    icon = cells['exterior-effects'][5]
                if n == 20:
                    icon = cells['exterior-effects'][10]
                icon = ImageOps.contain(icon.crop(icon.getbbox()), (28, 28), Image.Resampling.NEAREST)
                image.alpha_composite(icon, (x + (32 - icon.width) // 2, y + (32 - icon.height) // 2))
                draw.rectangle((x, y, x + 31, y + 31), outline=colors[2])
            coverage[rid]['icon_source'] = 'ui'
            coverage[rid]['icon_cells'] = icon_cells
            coverage[rid]['icon_overrides'] = {'1': ['exterior-effects', 5], '20': ['exterior-effects', 10]}
        if rid in [0x812D, 0x8137, 0x8191, 0x8196, 0x81F5, 0x8259, 0x825B]:
            image = ImageEnhance.Brightness(image).enhance(0.75)
        images[rid] = image
    for rid, count in [(0x87E9, 10), (0x87EA, 12), (0x87EC, 10)]:
        images[rid] = Image.new('RGBA', images[rid].size, colors[15])
        draw = ImageDraw.Draw(images[rid])
        for n in range(count):
            label = str(n)
            if rid == 0x87EA:
                label = ['B1', 'B2', 'B', '1', '2', '3', '4', '5', '6', '7', '8', '9'][n]
            ink = colors[7]
            if rid == 0x87EC:
                ink = colors[12]
            plaque = cells['transport'][5].resize((12, 19), Image.Resampling.NEAREST)
            images[rid].alpha_composite(plaque, (n * 16, 15))
            draw.text((n * 16 + 1, 16), label, fill=ink, font=ImageFont.load_default(size=14))
        coverage[rid] = dict(source='transport', cells=[5], frames=count, key=15,
                             operation='generated shaft plaques with deterministic floor labels')

    assert set(coverage) == set(images)
    for rid, image in images.items():
        if image.mode == 'RGBA':
            key = coverage[rid].get('key', 0)
            mask = image.getchannel('A').point(lambda a: 255 * (a < 128))
            if rid in [0x87E9, 0x87EA, 0x87EC]:
                mask = image.convert('L').point(lambda v: 255 * (v == 25))
            key_masks[rid] = (key, mask)
            image = image.convert('RGB')
            image.paste(colors[key], mask=mask)
            images[rid] = image
    # Keep semantic colors/keys and cycling slots, adding theme-specific shades.
    swatch = Image.new('RGB', (1536, 1024 * 5))
    for i, category in enumerate(['rooms', 'people', 'transport', 'exterior-effects', 'ui']):
        swatch.paste(Image.open(destination / 'sources' / (category + '.png')).convert('RGB'), (0, i * 1024))
    theme = swatch.quantize(colors=171, dither=Image.Dither.NONE).getpalette()
    colors[19:190] = [tuple(theme[i:i + 3]) for i in range(0, 171 * 3, 3)]
    palette.putpalette([c for rgb in colors for c in rgb])

resources = {}
resources[(0xFF03, 0x83E8)] = b''.join(struct.pack('>HHHH', i, r * 257, g * 257, b * 257) for i, (r, g, b) in enumerate(colors))
contact = Image.new('RGB', (800, ((len(images) + 3) // 4) * 90), colors[14])
for i, (rid, image) in enumerate(sorted(images.items())):
    indexed = image.quantize(palette=palette, dither=Image.Dither.NONE)
    if rid in key_masks:
        key, mask = key_masks[rid]
        replacement = min((n for n in range(19, 190) if colors[n] != colors[key]), key=lambda n: sum((colors[n][c] - colors[key][c]) ** 2 for c in range(3)))
        remap = list(range(256))
        remap[key] = replacement
        indexed = indexed.point(remap)
        indexed.paste(key, mask=mask)
    if rid in [0x8429, 0x842B, 0x8768, 0x8868]:
        # Palette-cycled status lamps (indices must survive quantization).
        for x in range(7):
            indexed.putpixel((x + 2, 4), 197 + x)
    w, h = indexed.size
    kind = 0x8002
    if rid in raw_ids:
        kind = 0xFF02
        blob = b''.join(indexed.crop((x, 0, x + 8, 36)).tobytes() for x in range(0, w, 8))
    else:
        stride = (w + 3) & ~3
        pixels = b''.join(indexed.crop((0, y, w, y + 1)).tobytes() + bytes(stride - w) for y in range(h - 1, -1, -1))
        blob = struct.pack('<IiiHHIIiiII', 40, w, h, 1, 8, 0, len(pixels), 0, 0, 256, 0)
        blob += b''.join(bytes((b, g, r, 0)) for r, g, b in colors) + pixels
    resources[(kind, rid)] = blob
    thumb = indexed.convert('RGB')
    thumb.thumbnail((192, 64), Image.Resampling.NEAREST)
    x, y = i % 4 * 200, i // 4 * 90
    contact.paste(thumb, (x + 4, y + 18))
    ImageDraw.Draw(contact).text((x + 4, y + 3), f'{rid:04X}  {w}x{h}', fill=colors[1])
resources.update({(0xFF0A, rid): wav for rid, wav in SOUNDS.items()})
resources.update(TEXTS)
# Resource-only MZ/NE: no executable code, no input executable, 256-byte alignment.
shift = 8
groups = sorted(set(kind for kind, rid in resources))
header_size = 128 + 2 + sum(8 + 12 * sum(kind == t for kind, rid in resources) for t in groups) + 4
offset = (header_size + 255) & ~255
output = bytearray(offset)
output[:2] = b'MZ'
struct.pack_into('<I', output, 0x3C, 64)
output[64:66] = b'NE'
struct.pack_into('<H', output, 64 + 0x24, 64)
struct.pack_into('<H', output, 64 + 0x32, shift)
struct.pack_into('<H', output, 128, shift)
pos = 130
for kind in groups:
    entries = [(rid, blob) for (t, rid), blob in sorted(resources.items()) if t == kind]
    struct.pack_into('<HHI', output, pos, kind, len(entries), 0)
    pos += 8
    for rid, blob in entries:
        padded = (len(blob) + 255) & ~255
        struct.pack_into('<HHHHHH', output, pos, offset >> shift, padded >> shift, 0x30, rid, 0, 0)
        pos += 12
        output.extend(blob + bytes(padded - len(blob)))
        offset += padded
(destination / 'tower.dat').write_bytes(output)
if args.style:
    contact.save(destination / 'contact-sheet.png')
    records = []
    for rid, image in sorted(images.items()):
        records.append(dict(id=f'{rid:04X}', width=image.width, height=image.height,
                            raw=rid in raw_ids, **coverage[rid]))
    sources = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
               for p in sorted((destination / 'sources').glob('*.png'))}
    if args.style == 'miniature-3d':
        for record in records:
            if record['source'] == 'rooms':
                record['room_row_bounds'] = bands
    (destination / 'coverage.json').write_text(json.dumps(dict(style=args.style, sources=sources,
        pack_sha256=hashlib.sha256(output).hexdigest(),
        grids={'rooms': [2, 8], 'people': [6, 4], 'transport': [4, 4],
               'exterior-effects': [4, 4], 'ui': [4, 4]},
        source_crops=source_crops, sprites=records), indent=2) + '\n')
else:
    contact.save(ART / 'contact-sheet.png')
print(f'{len(images)} sprites, {len(SOUNDS)} sounds, {len(TEXTS)} text resources, {len(output)} bytes')
