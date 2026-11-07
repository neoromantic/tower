#!/usr/bin/env python3
"""Build original resources: uv run --with pillow==12.0.0 python tools/generate_resources.py."""
import json
import math
from pathlib import Path
import re
import struct

from PIL import Image, ImageDraw, ImageEnhance, ImageFont
from sound_resources import SOUNDS, TEXTS

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'data/art'
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
source = Image.open(ART / 'interiors.png').convert('RGB')
tiles = []
for i in range(16):
    x, y = i % 2 * source.width // 2, i // 2 * source.height // 8
    tiles.append(source.crop((x, y, x + source.width // 2, y + source.height // 8)))
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

# CGPK is eight-pixel columns of 36 top-down rows, NOT a linear raster.
for base, chunks in [(0x89E8, 3), (0x8A28, 2), (0x8A68, 1)]:
    for v in range(3):
        rid = base + v
        image = Image.new('RGB', (chunks * 328, cell_h), colors[7])
        for chunk in range(chunks):
            image.paste(tiles[12].resize((328, cell_h), Image.Resampling.NEAREST), (chunk * 328, 0))
        images[rid] = image
        raw_ids.add(rid)

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

resources = {}
resources[(0xFF03, 0x83E8)] = b''.join(struct.pack('>HHHH', i, r * 257, g * 257, b * 257) for i, (r, g, b) in enumerate(colors))
contact = Image.new('RGB', (800, ((len(images) + 3) // 4) * 90), colors[14])
for i, (rid, image) in enumerate(sorted(images.items())):
    indexed = image.quantize(palette=palette, dither=Image.Dither.NONE)
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
(ROOT / 'data/tower.dat').write_bytes(output)
contact.save(ART / 'contact-sheet.png')
print(f'{len(images)} sprites, {len(SOUNDS)} sounds, {len(TEXTS)} text resources, {len(output)} bytes')
