import sys, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageFont, ImageChops
D=sys.argv[1]; OUT=sys.argv[2]
src=Image.open(f"{D}/src.jpg").convert("RGB")
CX,CY,R=537,306,224
S=1280; C=S//2
SERIF="/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
SANS="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
GOLD_L=(255,228,150); GOLD=(222,178,84); GOLD_D=(138,96,28)
NAVY=(10,24,62); NAVY_D=(4,11,32)

def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))

# ---------- фон: радиальный градиент + виньетка ----------
bg=Image.new("RGB",(S,S)); px=bg.load()
for y in range(S):
    for x in range(S):
        t=min(1,math.hypot(x-C,y-S*0.40)/(S*0.70))
        px[x,y]=lerp((46,92,170),NAVY_D,t**0.9)
bg=bg.convert("RGBA")

# Андреевский крест: мягкие диагонали, затухают к краям
cr=Image.new("L",(S,S),0); d=ImageDraw.Draw(cr)
for w,a in ((240,60),(180,80),(130,95)):
    d.line((0,0,S,S),fill=a,width=w); d.line((S,0,0,S),fill=a,width=w)
fade=Image.new("L",(S,S),0); fp=fade.load()
for y in range(S):
    for x in range(S):
        fp[x,y]=int(255*max(0,1-math.hypot(x-C,y-C)/(S*0.62)))
cr=ImageChops.multiply(cr.filter(ImageFilter.GaussianBlur(6)),fade)
bg=Image.composite(Image.new("RGBA",(S,S),(150,190,245,255)),bg,cr)

# лучи от эмблемы
rays=Image.new("L",(S,S),0); d=ImageDraw.Draw(rays)
EY=548
for i in range(24):
    a1=math.radians(i*15); a2=a1+math.radians(5)
    d.polygon([(C,EY),(C+900*math.cos(a1),EY+900*math.sin(a1)),(C+900*math.cos(a2),EY+900*math.sin(a2))],fill=28)
rays=ImageChops.multiply(rays.filter(ImageFilter.GaussianBlur(10)),fade)
bg=Image.composite(Image.new("RGBA",(S,S),GOLD_L+(255,)),bg,rays)

# свечение за эмблемой
glow=Image.new("L",(S,S),0); ImageDraw.Draw(glow).ellipse((C-470,EY-470,C+470,EY+470),fill=110)
bg=Image.composite(Image.new("RGBA",(S,S),(255,214,130,255)),bg,glow.filter(ImageFilter.GaussianBlur(70)))

# лёгкое зерно
random.seed(7); noise=Image.effect_noise((S,S),18).point(lambda v:v-128 if v>128 else 0)
bg=Image.composite(Image.new("RGBA",(S,S),(255,255,255,255)),bg,noise.point(lambda v:int(v*0.25)))

# ---------- эмблема ----------
ER=372
e=src.crop((CX-R,CY-R,CX+R,CY+R)).resize((2*ER,2*ER),Image.LANCZOS)
e=ImageEnhance.Contrast(e).enhance(1.18); e=ImageEnhance.Color(e).enhance(1.15)
e=e.filter(ImageFilter.UnsharpMask(radius=2,percent=80,threshold=2))
em=Image.new("L",e.size,0); ImageDraw.Draw(em).ellipse((4,4,2*ER-4,2*ER-4),fill=255)
em=em.filter(ImageFilter.GaussianBlur(1.5))

# тень
sh=Image.new("L",(S,S),0); ImageDraw.Draw(sh).ellipse((C-ER-6,EY-ER+22,C+ER+6,EY+ER+34),fill=170)
bg=Image.composite(Image.new("RGBA",(S,S),(0,0,10,255)),bg,sh.filter(ImageFilter.GaussianBlur(24)))

# внешние золотые кольца с точками
def gold_ring(img,r,w):
    lay=Image.new("RGBA",(S,S),(0,0,0,0)); dd=ImageDraw.Draw(lay)
    dd.ellipse((C-r,EY-r,C+r,EY+r),outline=GOLD_D+(255,),width=w+4)
    dd.ellipse((C-r+2,EY-r+2,C+r-2,EY+r-2),outline=GOLD+(255,),width=w)
    dd.ellipse((C-r+2,EY-r+2,C+r-2,EY+r-2-w//2),outline=GOLD_L+(140,),width=max(1,w//3))
    return Image.alpha_composite(img,lay)
bg=gold_ring(bg,ER+40,10)
lay=Image.new("RGBA",(S,S),(0,0,0,0)); dd=ImageDraw.Draw(lay)
dd.ellipse((C-ER-24,EY-ER-24,C+ER+24,EY+ER+24),fill=NAVY+(255,))
for k in range(72):
    a=math.radians(k*5); rr=ER+12; x=C+rr*math.cos(a); y=EY+rr*math.sin(a)
    dd.ellipse((x-4,y-4,x+4,y+4),fill=GOLD+(255,))
bg=Image.alpha_composite(bg,lay)
bg=gold_ring(bg,ER+2,6)
bg.paste(e,(C-ER,EY-ER),em)
# блик сверху на эмблеме
hl=Image.new("L",(S,S),0); ImageDraw.Draw(hl).ellipse((C-ER*0.8,EY-ER*0.98,C+ER*0.8,EY-ER*0.15),fill=38)
mask_e=Image.new("L",(S,S),0); mask_e.paste(em,(C-ER,EY-ER))
hl=ImageChops.multiply(hl.filter(ImageFilter.GaussianBlur(30)),mask_e)
bg=Image.composite(Image.new("RGBA",(S,S),(255,255,255,255)),bg,hl)

# ---------- лента с надписью ----------
RY=905; RH=150; RW=880
def grad_fill(size,top,bot):
    g=Image.new("RGBA",size); gp=g.load()
    for y in range(size[1]):
        c=lerp(top,bot,y/max(1,size[1]-1))
        for x in range(size[0]): gp[x,y]=c+(255,)
    return g
# хвосты ленты (сзади)
tails=Image.new("RGBA",(S,S),(0,0,0,0)); td=ImageDraw.Draw(tails)
for sgn in (-1,1):
    x0=C+sgn*(RW//2-70); x1=C+sgn*(RW//2+110)
    pts=[(x0,RY+40),(x1,RY+40),(x1-sgn*55,RY+40+RH//2+5),(x1,RY+RH+40),(x0,RY+RH+40)]
    td.polygon(pts,fill=(16,36,88,255)); td.line(pts+[pts[0]],fill=GOLD_D+(255,),width=6)
    td.polygon([(x0,RY+RH),(C+sgn*(RW//2),RY+RH),(x0,RY+RH+40)],fill=(3,9,26,255))
sh2=tails.split()[3].filter(ImageFilter.GaussianBlur(14))
bg=Image.composite(Image.new("RGBA",(S,S),(0,0,0,255)),bg,sh2.point(lambda v:int(v*0.5)))
bg=Image.alpha_composite(bg,tails)
# основная лента
body=grad_fill((RW,RH),(30,62,138),(9,24,66))
bm=Image.new("L",(RW,RH),0); ImageDraw.Draw(bm).rectangle((0,0,RW,RH),fill=255)
shb=Image.new("L",(S,S),0); ImageDraw.Draw(shb).rectangle((C-RW//2,RY+14,C+RW//2,RY+RH+20),fill=200)
bg=Image.composite(Image.new("RGBA",(S,S),(0,0,0,255)),bg,shb.filter(ImageFilter.GaussianBlur(16)))
bg.paste(body,(C-RW//2,RY),bm)
dd=ImageDraw.Draw(bg)
for off,col,w in ((0,GOLD_D,10),(3,GOLD,6)):
    dd.rectangle((C-RW//2+off,RY+off,C+RW//2-off,RY+RH-off),outline=col+(255,),width=w)
dd.rectangle((C-RW//2+18,RY+18,C+RW//2-18,RY+RH-18),outline=GOLD+(150,),width=2)
for sgn in (-1,1):
    sx=C+sgn*(RW//2-48); sy=RY+RH//2
    dd.polygon([(sx,sy-14),(sx+10,sy),(sx,sy+14),(sx-10,sy)],fill=GOLD+(255,))

# текст с золотым градиентом и разрядкой
def spaced(text,font,track):
    widths=[font.getlength(ch) for ch in text]; return sum(widths)+track*(len(text)-1),widths
font=ImageFont.truetype(SERIF,112); text="БУРСА МИК"; track=10
tw,ws=spaced(text,font,track)
asc,desc=font.getmetrics()
tm=Image.new("L",(S,S),0); tdraw=ImageDraw.Draw(tm)
x=C-tw/2; ty=RY+RH//2-(asc+desc)//2+6
for ch,w in zip(text,ws):
    tdraw.text((x,ty),ch,font=font,fill=255); x+=w+track
# тень и обводка
bg=Image.composite(Image.new("RGBA",(S,S),(0,0,0,255)),bg,ImageChops.offset(tm,0,6).filter(ImageFilter.GaussianBlur(5)).point(lambda v:int(v*0.8)))
bg=Image.composite(Image.new("RGBA",(S,S),GOLD_D+(255,)),bg,tm.filter(ImageFilter.MaxFilter(7)))
tg=Image.new("RGBA",(S,S)); tgp=tg.load()
for y in range(S):
    t=(y-ty-asc*0.25)/(asc*0.9); t=min(1,max(0,t))
    c=lerp(GOLD_L,GOLD,min(1,t*1.6)) if t<0.55 else lerp(GOLD,GOLD_D,(t-0.55)/0.45)
    for x in range(S): tgp[x,y]=c+(255,)
bg=Image.composite(tg,bg,tm)

# искры
sp=Image.new("RGBA",(S,S),(0,0,0,0)); sd=ImageDraw.Draw(sp)
for (x,y,s) in ((C-430,250,30),(C+440,290,22),(C+370,170,14),(C-350,150,12),(C-500,560,14),(C+505,620,18)):
    sd.polygon([(x,y-s),(x+s*0.22,y-s*0.22),(x+s,y),(x+s*0.22,y+s*0.22),(x,y+s),(x-s*0.22,y+s*0.22),(x-s,y),(x-s*0.22,y-s*0.22)],fill=GOLD_L+(230,))
bg=Image.alpha_composite(bg,sp.filter(ImageFilter.GaussianBlur(0.8)))

out=bg.convert("RGB").resize((640,640),Image.LANCZOS)
out.save(OUT,quality=95)
mk=Image.new("L",(640,640),0); ImageDraw.Draw(mk).ellipse((0,0,639,639),fill=255)
pv=Image.new("RGB",(980,660),(255,255,255)); pv.paste(out,(10,10),mk)
pv.paste(out.resize((160,160),Image.LANCZOS),(700,60),mk.resize((160,160)))
pv.paste(out.resize((64,64),Image.LANCZOS),(748,300),mk.resize((64,64)))
pv.save(OUT.replace(".jpg","_preview.png"))
