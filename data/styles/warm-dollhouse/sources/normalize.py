"""Reproduce source-only normalization; run with Pillow, numpy, scipy, opencv-python-headless."""
from pathlib import Path
import hashlib, json, shutil
import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_fill_holes

root = Path(__file__).parent
for name in ['rooms', 'exterior-effects']:
    original = root / (name + '.generated.png')
    if not original.exists():
        shutil.copyfile(root / (name + '.png'), original)

rooms = Image.open(root / 'rooms.generated.png').convert('RGB')
recycling = Image.open(root / 'recycling-room.generated.png').convert('RGB')
bands = [0,154,302,446,591,732,876,1024]
crops = []
for row in range(6):
    for col in range(2):
        crops.append({'index':len(crops), 'source':'rooms.generated.png', 'box':[col*768,bands[row],(col+1)*768,bands[row+1]]})
crops.extend([
    {'index':12,'source':'rooms.generated.png','box':[0,876,768,1024]},
    {'index':13,'source':'rooms.generated.png','box':[768,876,1150,1024]},
    {'index':14,'source':'recycling-room.generated.png','box':[0,0,1536,824]},
    {'index':15,'source':'rooms.generated.png','box':[1150,876,1536,1024]},
])
normalized = Image.new('RGB',(1536,1024))
for crop in crops:
    src = rooms
    if crop['index'] == 14:
        src = recycling
    cell = src.crop(crop['box']).resize((768,128),Image.Resampling.LANCZOS)
    xy = [(crop['index']%2)*768,(crop['index']//2)*128]
    normalized.paste(cell,tuple(xy))
    crop['destination_box'] = xy + [xy[0]+768,xy[1]+128]
    crop['method'] = 'Pillow crop, exclusive right/bottom; anisotropic LANCZOS resize to 768x128; no generative editing'
normalized.save(root / 'rooms.png')

original = Image.open(root / 'exterior-effects.generated.png').convert('RGB')
exterior = original.convert('RGBA')
# Observed object bounds, local to the exact 384x256 cell. All RGB pixels remain original.
rects = {3:[0,32,384,241],4:[0,61,384,187],7:[122,29,257,210],8:[128,8,263,205],9:[126,8,261,205],10:[4,3,378,232],11:[39,0,336,233],12:[70,9,310,222],13:[76,10,310,222],14:[78,7,308,207],15:[78,6,309,222]}
anchors = {3:[(70,100),(170,190),(290,140)],4:[(150,155),(245,145)],7:[(196,155)],8:[(192,145)],9:[(194,142)],10:[(194,148)],11:[(198,173)],12:[(195,100)],13:[(175,110)],14:[(192,135)],15:[(190,128)]}
cutouts = []
for index in range(3,16):
    x,y = (index%4)*384,(index//4)*256
    rgb = np.array(original.crop((x,y,x+384,y+256)))
    if index in [4,5,6,11]:
        # These are complete wall/trim tiles: retain the illustrated wall, not just wood/roof colors.
        polygons = {4:[(3,181),(9,164),(24,160),(29,143),(33,128),(38,159),(47,150),(53,128),(60,125),(61,112),(70,106),(80,110),(91,104),(105,108),(105,123),(130,121),(130,110),(150,108),(150,98),(167,95),(181,101),(181,116),(216,116),(223,86),(229,75),(233,61),(240,79),(244,109),(249,112),(249,126),(267,114),(288,111),(309,119),(309,141),(332,147),(342,164),(349,155),(355,136),(363,160),(372,175),(379,181)],5:[(5,47),(377,47),(377,197),(8,197)],6:[(8,68),(375,68),(375,186),(8,186)],11:[(40,232),(44,187),(61,175),(66,141),(88,141),(96,105),(119,105),(127,76),(138,45),(147,75),(158,80),(158,65),(180,49),(194,45),(205,8),(214,45),(225,49),(242,65),(247,81),(256,75),(266,47),(275,80),(282,108),(303,117),(306,152),(325,177),(331,232)]}
        mask_image = Image.new('L',(384,256)); ImageDraw.Draw(mask_image).polygon(polygons[index],fill=255)
        alpha = np.array(mask_image)
        details = {'polygon':polygons[index],'method':'Observed complete wall/trim bounds; polygon alpha; full interior RGB retained'}
    else:
        cv2.setRNGSeed(0)
        mask = np.zeros((256,384),np.uint8)
        left,top,right,bottom = rects[index]
        mask[top:bottom,left:right] = cv2.GC_PR_FGD
        for point in anchors[index]:
            cv2.circle(mask,point,6,cv2.GC_FGD,-1)
        # Edge-connected gradient is background; object interiors are protected after segmentation.
        cv2.grabCut(rgb,mask,None,np.zeros((1,65),np.float64),np.zeros((1,65),np.float64),8,cv2.GC_INIT_WITH_MASK)
        foreground = np.isin(mask,[cv2.GC_FGD,cv2.GC_PR_FGD])
        count,labels,stats,centroids = cv2.connectedComponentsWithStats(foreground.astype(np.uint8),8)
        keep = np.zeros_like(foreground)
        for component in range(1,count):
            if stats[component,cv2.CC_STAT_AREA] >= 12:
                keep[labels == component] = True
        alpha = binary_fill_holes(keep).astype(np.uint8)*255
        details = {'bounds':rects[index],'foreground_anchor_circles':anchors[index],'anchor_radius':6,'method':'OpenCV GrabCut, fixed RNG seed 0, eight iterations; outside observed bounds definite background; inside probable foreground; anchors definite foreground; retain components >=12px; fill enclosed holes to preserve original subject interiors; binary alpha, RGB unchanged'}
    if index == 7:
        # Flame has an orange glow that GrabCut confused with the subject. Keep bright flame pigments only.
        pigment = (rgb[:,:,0] > 244) & (((rgb[:,:,0].astype(int)-rgb[:,:,1] > 15) & (rgb[:,:,1].astype(int)-rgb[:,:,2] > 35)) | (rgb[:,:,1] > 230))
        support = np.zeros((256,384),bool); support[29:210,122:257] = True
        alpha = binary_fill_holes(pigment & support).astype(np.uint8)*255
        details = {'bounds':[122,29,257,210],'method':'Bright warm flame pigment R>244 and ((R-G>15 and G-B>35) or G>230) within observed bounds; fill enclosed holes; RGB unchanged'}
    cell = Image.fromarray(rgb).convert('RGBA'); cell.putalpha(Image.fromarray(alpha))
    exterior.paste(cell,(x,y))
    details.update({'index':index,'transparent_pixels':int((alpha==0).sum()),'opaque_pixels':int((alpha==255).sum())})
    cutouts.append(details)
exterior.save(root / 'exterior-effects.png')
# Review evidence uses checkerboard, labels and separation without changing the production grids.
for name,cols,rows,w,h in [('rooms',2,8,768,128),('exterior-effects',4,4,384,256)]:
    source = Image.open(root/(name+'.png')).convert('RGBA')
    contact = Image.new('RGB',(cols*(w+8),rows*(h+26)), '#2b3035')
    draw = ImageDraw.Draw(contact)
    for index in range(cols*rows):
        cell=source.crop(((index%cols)*w,(index//cols)*h,(index%cols+1)*w,(index//cols+1)*h))
        back=Image.new('RGB',(w,h),'#e0e0e0'); tiles=ImageDraw.Draw(back)
        for yy in range(0,h,16):
            for xx in range(0,w,16):
                if (xx//16+yy//16)%2:
                    tiles.rectangle((xx,yy,xx+15,yy+15),fill='#b0b0b0')
        back.paste(cell,mask=cell.getchannel('A'))
        px,py=(index%cols)*(w+8),(index//cols)*(h+26)
        contact.paste(back,(px,py+20)); draw.text((px+4,py+3),str(index),fill='white')
    contact.save(root/(name+'.contact.png'))

manifest={'rooms':{'original_bands':bands,'original_observation':'Seven bands, fifteen actual rooms, parking and machinery share final right half. Recycling absent. Original was NOT a valid eight-row sheet.','crops':crops},'exterior_effects':{'grid':[4,4],'unchanged_full_sky_cells':[0,1,2],'cutouts':cutouts,'rgb_policy':'Original RGB unchanged in every cell, only alpha modified; no global white/color key.'},'files':{}}
for name in ['rooms.generated.png','rooms.png','recycling-room.generated.png','exterior-effects.generated.png','exterior-effects.png','rooms.contact.png','exterior-effects.contact.png']:
    path=root/name
    manifest['files'][name]={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'dimensions':list(Image.open(path).size)}
(root/'normalization.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest['files'],indent=2))
