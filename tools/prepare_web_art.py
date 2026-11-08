#!/usr/bin/env python3
"""Crop existing source plates for Three.js; no generation or resampling."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
output = root / 'web/dist/hires'
for style in ['schematic', 'modern-pixel', 'warm-dollhouse', 'miniature-3d']:
    destination = output / style
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for category, columns, rows in [('rooms', 2, 8), ('people', 6, 4), ('transport', 4, 4), ('exterior-effects', 4, 4)]:
        source = root / 'data/styles' / style / 'sources' / (category + '.png')
        plate = Image.open(source).convert('RGBA')
        bands = [i * plate.height // rows for i in range(rows + 1)]
        if style == 'miniature-3d' and category == 'rooms':
            bands = [0, 144, 284, 416, 545, 678, 796, 906, 1024]
        sprites = []
        frames = []
        for index in range(columns * rows):
            column, row = index % columns, index // columns
            box = [column * plate.width // columns, bands[row], (column + 1) * plate.width // columns, bands[row + 1]]
            sprite = plate.crop(box)
            if category in ['people', 'transport'] or category == 'exterior-effects' and index >= 3:
                # Only connected white background; retain white clothes and furniture.
                for corner in [(0, 0), (sprite.width - 1, 0), (0, sprite.height - 1), (sprite.width - 1, sprite.height - 1)]:
                    if min(sprite.getpixel(corner)[:3]) > 220:
                        ImageDraw.floodfill(sprite, corner, (255, 255, 255, 0), thresh=50)
                bounds = sprite.getbbox()
                if bounds and category != 'people' and not (category == 'transport' and index < 4):
                    sprite = sprite.crop(bounds)
            frames.append(sprite)
        # Preserve source registration across every pose and empty/loaded cabin.
        registered = frames
        if category == 'transport':
            registered = frames[:4]
        if category in ['people', 'transport']:
            bounds = [frame.getbbox() for frame in registered]
            union = (min(b[0] for b in bounds), min(b[1] for b in bounds),
                     max(b[2] for b in bounds), max(b[3] for b in bounds))
            for index in range(len(registered)):
                frames[index] = frames[index].crop(union)
        for index, sprite in enumerate(frames):
            column, row = index % columns, index // columns
            box = [column * plate.width // columns, bands[row], (column + 1) * plate.width // columns, bands[row + 1]]
            if category == 'people':
                # Source poses vary slightly in vertical placement; register feet.
                aligned = Image.new('RGBA', sprite.size)
                aligned.paste(sprite, (0, sprite.height - sprite.getbbox()[3]))
                sprite = aligned
            name = f'{category}-{index}.png'
            sprite.save(destination / name, optimize=True)
            entry = {'file': name, 'width': sprite.width, 'height': sprite.height, 'crop': box}
            if category == 'people':
                silhouette = Image.new('RGBA', sprite.size, 'white')
                silhouette.putalpha(sprite.getchannel('A'))
                entry['silhouette'] = f'people-silhouette-{index}.png'
                silhouette.save(destination / entry['silhouette'], optimize=True)
            sprites.append(entry)
        manifest[category] = {'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sprites': sprites}
    # Same source crops power the build catalogue; use the full-resolution originals.
    catalogue = root / 'web/dist/art/catalog' / style
    catalogue.mkdir(parents=True, exist_ok=True)
    mapping = {1:('rooms',12), 2:('exterior-effects',5), 3:('rooms',0), 4:('rooms',1),
               5:('rooms',2), 6:('rooms',2), 7:('rooms',2), 8:('rooms',5), 9:('rooms',4),
               10:('rooms',3), 11:('rooms',10), 12:('rooms',9), 13:('rooms',11),
               14:('rooms',13), 15:('exterior-effects',10), 16:('rooms',6), 17:('rooms',7),
               18:('rooms',14), 19:('transport',6), 20:('transport',8), 21:('transport',0),
               22:('transport',2), 23:('transport',3), 24:('rooms',8), 25:('transport',12)}
    for item, (category, index) in mapping.items():
        source = destination / manifest[category]['sprites'][index]['file']
        (catalogue / f'{item}.png').write_bytes(source.read_bytes())
    (destination / 'index.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
