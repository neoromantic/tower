"""Reproduce catalog thumbnails from existing plates: python3 web/art/catalog/generate.py."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[3]
out = Path(__file__).resolve().parent
# ItemType -> source plate and cell. Room registration is shared with pack coverage.
rooms = {1: 12, 3: 0, 4: 1, 5: 2, 6: 2, 7: 2, 8: 5, 9: 4,
         10: 3, 11: 10, 12: 9, 13: 11, 14: 13, 16: 6, 17: 7,
         18: 14, 24: 8, 25: 13}
transport = {19: 6, 20: 8, 21: 0, 22: 3, 23: 1}
exterior = {2: 7, 15: 6}
provenance = {}
for style in ['schematic', 'modern-pixel', 'warm-dollhouse', 'miniature-3d']:
    source = root / 'data/styles' / style
    coverage = json.loads((source / 'coverage.json').read_text())
    destination = out / style
    destination.mkdir(exist_ok=True)
    for plate, mapping in [('rooms', rooms), ('transport', transport), ('exterior-effects', exterior)]:
        path = source / 'sources' / (plate + '.png')
        image = Image.open(path).convert('RGBA')
        for item, cell in mapping.items():
            if plate == 'rooms':
                cell_box = coverage['source_crops']['rooms'][cell]
                left, top, right, bottom = cell_box
                center = (left + right) // 2
                half = bottom - top
                box = [center - half, top, center + half, bottom]
            else:
                x, y = cell % 4 * 384, cell // 4 * 256
                box = [x, y, x + 384, y + 256]
            thumb = ImageOps.contain(image.crop(box), (480, 160), Image.Resampling.LANCZOS)
            thumb.save(destination / (str(item) + '.png'), optimize=True)
            provenance[style + '/' + str(item)] = dict(source=path.relative_to(root).as_posix(),
                source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(), crop=box,
                size=list(thumb.size), sha256=hashlib.sha256((destination / (str(item) + '.png')).read_bytes()).hexdigest())
(out / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
