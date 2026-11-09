"""Векторная перерисовка эмблемы МГУ им. Невельского по фото: ровно, без перспективы, в высоком разрешении."""
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops, ImageEnhance
D=sys.argv[1]; OUT=sys.argv[2]
src=Image.open(f"{D}/src.jpg").convert("RGB")
CX,CY=533.2,306.5          # центр эмблемы на фото (фит каната)
TILT=5.6                   # эмблема на фото повёрнута на 5.6° против часовой
RS=232                     # внешний радиус эмблемы в пикселях фото
N=1600; H=N/2; f=H/RS      # рисуем в 1600 px
NAVY=(22,44,100); NAVY_L=(42,72,140); NAVY_D=(10,24,62)
GOLD=(226,182,82); GOLD_L=(255,232,160); GOLD_D=(140,98,30)
WHITE=(246,248,252)
FONT="/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf"

def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
img=Image.new("RGBA",(N,N),(0,0,0,0))
yy,xx=np.mgrid[0:N,0:N]; rr=np.hypot(xx-H,yy-H)

def disc(r): 
    m=Image.new("L",(N,N),0); ImageDraw.Draw(m).ellipse((H-r,H-r,H+r,H+r),fill=255); return m
def ring_mask(r1,r2): return ImageChops.subtract(disc(r2),disc(r1))

# --- основа: тёмно-синий диск с мягким объёмом ---
t=np.clip(rr/(RS*f),0,1)
base=np.zeros((N,N,4),np.uint8)
for i in range(3): base[...,i]=(NAVY_L[i]+(NAVY_D[i]-NAVY_L[i])*t**1.6).astype(np.uint8)
base[...,3]=255
img=Image.composite(Image.fromarray(base,"RGBA"),img,disc(RS*f))

# --- канат ---
R1,R2=203*f,224*f; RM=(R1+R2)/2; RW=R2-R1
d=ImageDraw.Draw(img)
img=Image.composite(Image.new("RGBA",(N,N),GOLD_D+(255,)),img,ring_mask(R1,R2))
twist=Image.new("RGBA",(N,N),(0,0,0,0)); td=ImageDraw.Draw(twist)
K=120
for k in range(K):
    a=2*math.pi*k/K; x=H+RM*math.cos(a); y=H+RM*math.sin(a)
    ang=a+math.pi/2+math.radians(48)
    L,W=RW*1.25,RW*0.42
    for (ll,ww,col) in ((L,W,GOLD_D),(L*0.92,W*0.78,GOLD),(L*0.55,W*0.3,GOLD_L)):
        pts=[]
        for j in range(24):
            q=2*math.pi*j/24; px=ll/2*math.cos(q); py=ww/2*math.sin(q)
            pts.append((x+px*math.cos(ang)-py*math.sin(ang), y+px*math.sin(ang)+py*math.cos(ang)))
        td.polygon(pts,fill=col+(255,))
twist=Image.composite(twist,Image.new("RGBA",(N,N),(0,0,0,0)),ring_mask(R1-1,R2+1))
img=Image.alpha_composite(img,twist)
d=ImageDraw.Draw(img)
for r,w,c in ((R2,5,GOLD_D),(R1,5,GOLD_D)):
    d.ellipse((H-r,H-r,H+r,H+r),outline=c+(255,),width=w)
d.ellipse((H-RS*f+3,H-RS*f+3,H+RS*f-3,H+RS*f-3),outline=GOLD_D+(255,),width=6)

# --- внутреннее золотое кольцо ---
RI=136*f
d.ellipse((H-RI,H-RI,H+RI,H+RI),outline=GOLD+(255,),width=int(4.5*f))

# --- надпись по кругу ---
text="МОРСКОЙ ГОСУДАРСТВЕННЫЙ УНИВЕРСИТЕТ"
font=ImageFont.truetype(FONT,int(44*f))
RT=170*f                   # радиус центра строки
A0,A1=math.radians(132),math.radians(408)   # от левого низа через верх к правому низу
ws=[font.getlength(c) for c in text]
gap=0.06*font.size
total=sum(ws)+gap*(len(text)-1)
sx=(A1-A0)*RT/total        # растягивание/сжатие по дуге
pos=0
asc,desc=font.getmetrics()
for ch,w in zip(text,ws):
    mid=pos+w/2; a=A0+mid*sx/RT; pos+=w+gap
    if ch==" ": continue
    gw=int(w*sx*0.9)+8
    g=Image.new("L",(int(w)+20,asc+desc+20),0)
    ImageDraw.Draw(g).text((10,10),ch,font=font,fill=255)
    g=g.resize((max(4,int(g.width*min(1,sx*0.92))),g.height),Image.LANCZOS)
    g=g.rotate(-math.degrees(a)-90,resample=Image.BICUBIC,expand=True)
    x=H+RT*math.cos(a); y=H+RT*math.sin(a)
    lay=Image.new("L",(N,N),0); lay.paste(g,(int(x-g.width/2),int(y-g.height/2)))
    img=Image.composite(Image.new("RGBA",(N,N),WHITE+(255,)),img,lay)

# --- парусник: берём с фото, выпрямляем и чистим ---
pad=int(RS*1.15)
crop=src.crop((int(CX-pad),int(CY-pad),int(CX+pad),int(CY+pad)))
crop=crop.rotate(-TILT,resample=Image.BICUBIC,center=(CX-int(CX-pad),CY-int(CY-pad)))
big=crop.resize((int(crop.width*f*1.0),int(crop.height*f*1.0)),Image.LANCZOS)
arr=np.asarray(big).astype(float)
lum=arr.mean(axis=2); sat=arr.max(axis=2)-arr.min(axis=2)
cx2=cy2=pad*f
Y,X=np.mgrid[0:big.height,0:big.width]
inner=np.hypot(X-cx2,Y-cy2)<(130*f)
book_zone=(Y-cy2>78*f)
m=((lum>150)&(sat<70)&inner&~book_zone).astype(np.uint8)*255
ship=Image.fromarray(m,"L").filter(ImageFilter.GaussianBlur(2.4)).point(lambda v:255 if v>118 else 0)
ship=ship.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1.3))
# тень паруса — лёгкая растушёвка снизу вверх
off=int(H-cx2)
sm=Image.new("L",(N,N),0); sm.paste(ship,(off,off))
shade=Image.new("RGBA",(N,N)); sp=np.zeros((N,N,4),np.uint8)
tt=np.clip((yy-H+120*f)/(200*f),0,1)
for i,(a,b) in enumerate(zip(WHITE,(200,212,232))): sp[...,i]=(a+(b-a)*tt*0.6).astype(np.uint8)
sp[...,3]=255
img=Image.composite(Image.fromarray(sp,"RGBA"),img,sm)

# --- книга «1890» ---
BY=134*f; BW=64*f; BH=50*f
def book_poly(s):
    w,h=BW*s,BH*s
    return [(H-w,H+BY-h*0.95),(H-w*0.5,H+BY-h*1.05),(H,H+BY-h*0.9),(H+w*0.5,H+BY-h*1.05),(H+w,H+BY-h*0.95),
            (H+w,H+BY+h*0.8),(H+w*0.5,H+BY+h*0.72),(H,H+BY+h*0.95),(H-w*0.5,H+BY+h*0.72),(H-w,H+BY+h*0.8)]
d=ImageDraw.Draw(img)
d.polygon(book_poly(1.18),fill=NAVY+(255,))
d.polygon(book_poly(1.12),fill=GOLD_D+(255,))
d.polygon(book_poly(1.07),fill=GOLD+(255,))
d.polygon(book_poly(1.0),fill=WHITE+(255,))
for k in range(1,4):   # стопка страниц
    s=1-k*0.012
    d.line([(H-BW*0.98,H+BY+BH*(0.8-k*0.07)),(H-BW*0.5,H+BY+BH*(0.72-k*0.07)),(H,H+BY+BH*(0.95-k*0.07)),
            (H+BW*0.5,H+BY+BH*(0.72-k*0.07)),(H+BW*0.98,H+BY+BH*(0.8-k*0.07))],fill=(170,180,200,255),width=3)
d.line([(H,H+BY-BH*0.9),(H,H+BY+BH*0.95)],fill=(180,188,205,255),width=3)
bf=ImageFont.truetype(FONT,int(46*f))
tw=bf.getlength("1890"); a_,de_=bf.getmetrics()
d.text((H-tw/2,H+BY-BH*0.12-(a_)/2-4),"1890",font=bf,fill=NAVY_D+(255,))

# --- финальная маска круга ---
out=Image.composite(img,Image.new("RGBA",(N,N),(0,0,0,0)),disc(RS*f).filter(ImageFilter.GaussianBlur(1)))
out.save(OUT)
