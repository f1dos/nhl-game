"""Bake seamless hockey jersey knit from interlocking warp and weft loops."""
from pathlib import Path
from math import cos, sin, tau
from PIL import Image
out = Path(__file__).resolve().parents[1] / "src/assets"
width=128
def height(x,y):
    u,v=tau*x/16,tau*y/16
    return .65*cos(2*u+1.4*sin(v))+.35*cos(2*v+sin(u))
normal=Image.new("RGB",(width,width))
rough=Image.new("L",normal.size)
for y in range(width):
    for x in range(width):
        dx=(height(x-1,y)-height(x+1,y))*.42
        dy=(height(x,y-1)-height(x,y+1))*.42
        length=(dx*dx+dy*dy+1)**.5
        normal.putpixel((x,y),tuple(round(127.5*(1+a/length)) for a in (dx,dy,1)))
        rough.putpixel((x,y),round(213-24*height(x,y)))
normal.save(out/"jersey-knit-normal.png")
rough.save(out/"jersey-knit-roughness.png")
