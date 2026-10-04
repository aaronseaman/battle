"""Pack generated equal-cell atlases into runtime WebP sheets.
Usage: python tools/art/pack-gloss.py <source-paths.json>
Requires Pillow only for development-time asset packaging.
"""
import json, sys
from pathlib import Path
from PIL import Image

sources = json.loads(Path(sys.argv[1]).read_text())
base = Path('assets/art')
m = json.loads((base/'manifest.json').read_text())
sprites = m['sprites']
(base/'gloss').mkdir(exist_ok=True)

def cell(source, cols, rows, index):
    im = Image.open(sources[source]).convert('RGBA')
    fw, fh = im.width/cols, im.height/rows
    c, r = index%cols, index//cols
    return im.crop((round(c*fw), round(r*fh), round((c+1)*fw), round((r+1)*fh)))

def sheet(file, cells, frame, padding=.04):
    fw, fh = frame
    out = Image.new('RGBA', (fw*len(cells), fh))
    for i,im in enumerate(cells):
        im.thumbnail((round(fw*(1-padding*2)), round(fh*(1-padding*2))), Image.Resampling.LANCZOS)
        out.alpha_composite(im, (i*fw+(fw-im.width)//2, (fh-im.height)//2))
    target=base/file
    temporary=target.with_suffix('.tmp.webp')
    out.save(temporary, 'WEBP', quality=91, method=4)
    with Image.open(temporary) as check:
        check.load()
        assert check.size == out.size, file
    temporary.replace(target)

def anim(col=0, frames=1, loop=True, fps=4):
    return dict(row=0,col=col,frames=frames,fps=fps,loop=loop)

for name in ['jelly','jellyMini','crab','kraken','puffer','urchin','eel','octoMini','starMinion']:
    d=sprites['enemy.'+name]
    d['file']='gloss/enemy-'+name+'.webp'
    sheet(d['file'],[cell('enemy-'+name,2,2,i) for i in range(4)],d['frame'])
    d['anims']={'move':anim(frames=2), 'stun':anim(2), 'sad':anim(3), 'die':anim(3,loop=False,fps=2)}
    d['style']='gloss-v1';d['wobble']=False
    d['notes']='Glossy resin character; two swimming poses, anticipation and dazed defeat. Continuous motion and defeat shrink/fade are applied by the renderer.'

for name in ['fish','octopus','shark','starfish','puffer','seahorse','crab']:
    for level in range(1,4):
        d=sprites[f'tower.{name}.{level}']
        d['file']=f'gloss/buddy-{name}-{level}.webp'
        sheet(d['file'],[cell('buddy-'+name,3,2,level-1),cell('buddy-'+name,3,2,level+2)],d['frame'])
        d['anims']={'idle':anim(), 'fire':anim(1,loop=False,fps=5), 'disabled':anim(), 'broken':anim()}
        d['style']='gloss-v1';d['wobble']=False
        d['notes']=f'Glossy resin buddy, cyan crystal pedestal, tier {level}; authored idle and firing poses plus continuous breathing/recoil. Tier 2 has violet gems, tier 3 a gold crest.'

for name in ['golden','neon','galaxy']:
    d=sprites['player.'+name];d['file']='gloss/player-'+name+'.webp'
    sheet(d['file'],[Image.open(sources['skin-'+name]).convert('RGBA')],d['frame'])
    d['anims']={k:anim() for k in ['idle','swim','shoot','plus']}
    d['style']='gloss-v1';d['wobble']=False
    d['notes']='Glossy alternate fish skin. Continuous procedural swimming preserves the classic player silhouette.'

# Shared prop/projectile atlas avoids decoding the same image repeatedly.
sheet('gloss/projectiles.webp',[cell('misc-projectiles',4,3,i) for i in range(12)],[128,128],.03)
sheet('gloss/props.webp',[cell('misc-pickups',2,2,i) for i in range(4)],[128,128],.04)
projectiles={'proj.bubble':0,'proj.plus':1,'proj.minus':2,'proj.dart':3,'proj.ink':4,'proj.star':5,'proj.ministar':6,'strike.star':7,'strike.ink':8,'strike.spark':9,'heart':11}
props={'pickup.shell':0,'boss.chef.hat':2,'boss.kitty.tentacle':3}
for key,col in {**projectiles,**props}.items():
    d=sprites[key];old=max(d['frame']);d['scale']=d.get('scale',1)*old/128;d['frame']=[128,128]
    d['file']='gloss/props.webp' if key in props else 'gloss/projectiles.webp'
    d['anims']={k:anim(col) for k in d['anims']}
    d['style']='gloss-v1';d['notes']='Glossy glass/resin cutout from the shared production atlas. Existing orientation and gameplay scale are preserved.'
sprites['pickup.shell']['anims']['open']=anim(1,loop=False,fps=3)
for name in ['burst','splash','bubblefx','confetti']:
    sheet('gloss/fx-'+name+'.webp',[cell('misc-'+name,2,2,i) for i in range(4)],[192,192],.02)
for key,d in sprites.items():
    if key.startswith('fx.'):
        name=key.split('.')[1]
        family='splash' if name in ['ink','blind','grab'] else 'confetti' if name=='confetti' else 'bubblefx' if name in ['heal','shield_pop','poof','pulse','wave','plus_power','purr','respawn_bubble','sad'] else 'burst'
        old=max(d['frame']);d['scale']=d.get('scale',1)*old/192;d['frame']=[192,192]
        d['file']='gloss/fx-'+family+'.webp'
        d['anims']={k:anim(frames=4,loop=k=='loop',fps=8) for k in d['anims']}
        d['style']='gloss-v1';d['notes']=f'Four-frame glossy {family} animation; shared texture, one-shot or looping according to the existing effect contract.'
for d in sprites.values():
    d['style']='gloss-v1'
    assert d['file'] and d['file'].startswith('gloss/'), d['file']
m['version']=17
m['//']='Complete glossy production artwork. All sprite keys delivered; no older artwork loaded. Sprite coordinates are relative to assets/art/. See docs/art/COMPLETE-GLOSS-DELIVERY.md.'
(base/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
print(f'Packed {len(sprites)} glossy sprite definitions.')
