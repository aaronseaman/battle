"""Resize the approved glossy app artwork for PWA and iPhone launch surfaces."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
icon = Image.open(root/'assets/art/gloss/app-icon.webp').convert('RGB')
out = root/'icons'
out.mkdir(exist_ok=True)
def save(image, target):
    temporary=target.with_suffix('.tmp.png')
    image.save(temporary,optimize=True)
    with Image.open(temporary) as check:
        check.load()
        assert check.size == image.size
    temporary.replace(target)
for name, size in [('icon-192',192), ('icon-512',512), ('icon-maskable-512',512), ('apple-touch-icon',180)]:
    image=icon.resize((size,size), Image.Resampling.LANCZOS)
    if 'maskable' in name:
        # Keep the fish inside the maskable central safe circle on Android.
        image=Image.new('RGB',(size,size),(17,135,222))
        inset=round(size*.66)
        image.paste(icon.resize((inset,inset),Image.Resampling.LANCZOS),((size-inset)//2,(size-inset)//2))
    save(image,out/(name+'.png'))

for w,h in [(1206,2622),(1320,2868),(1260,2736),(1179,2556),(1290,2796),(1170,2532)]:
    canvas = Image.new('RGB',(w,h))
    draw = ImageDraw.Draw(canvas)
    for y in range(h):
        t=y/(h-1)
        color=tuple(round(a+(b-a)*t) for a,b in zip((7,75,180),(22,191,230)))
        draw.line((0,y,w,y),fill=color)
    size=round(w*.58)
    image=icon.resize((size,size),Image.Resampling.LANCZOS)
    mask=Image.new('L',(size,size));ImageDraw.Draw(mask).rounded_rectangle((0,0,size-1,size-1),radius=round(size*.22),fill=255)
    canvas.paste(image,((w-size)//2,round(h*.42-size/2)),mask)
    save(canvas,out/f'splash-{w}x{h}.png')
print('Glossy app icons and six iPhone launch screens packaged.')
