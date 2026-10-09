"""Sample public Mapzen Terrain Tiles onto the disclosed regional DEM grid."""
import hashlib
import io
import json
import math
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ZOOM, WIDTH, HEIGHT = 7, 421, 401
BOUNDS = [40, 10, 61, 30]
def pixel(lon, lat):
    n = 256 * 2 ** ZOOM
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
def decode(rgb):
    return rgb[0] * 256 + rgb[1] + rgb[2] / 256 - 32768
def generate():
    x0,y0=pixel(40,30); x1,y1=pixel(61,10)
    keys=[(x,y) for x in range(int(x0)//256,int(x1)//256+1) for y in range(int(y0)//256,int(y1)//256+1)]
    def download(key):
        x,y=key;url=f'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{ZOOM}/{x}/{y}.png'
        raw=urllib.request.urlopen(url,timeout=30).read()
        return key,Image.open(io.BytesIO(raw)).convert('RGB'),{'url':url,'sha256':hashlib.sha256(raw).hexdigest()}
    fetched=list(ThreadPoolExecutor(max_workers=4).map(download,keys));tiles={k:im for k,im,_ in fetched};values=[]
    for j in range(HEIGHT):
        for i in range(WIDTH):
            x,y=pixel(40+i*21/(WIDTH-1),30-j*20/(HEIGHT-1));ix,iy=int(x),int(y)
            values.append(round(decode(tiles[ix//256,iy//256].getpixel((ix%256,iy%256)))))
    data={'bounds':BOUNDS,'width':WIDTH,'height':HEIGHT,'metres':values,'rowOrder':'north to south','sampling':'nearest tile pixel at 0.05-degree grid spacing; zoom 7 source mosaic', 'retrieved':datetime.now(timezone.utc).isoformat(),'source':'Mapzen Terrain Tiles on AWS','attribution':'https://github.com/tilezen/joerd/blob/master/docs/attribution.md','tiles':[m for _,_,m in fetched]}
    path=ROOT/'web/assets/hormuz-terrain.json';path.write_text(json.dumps(data,separators=(',',':'))+'\n');print(f'{len(values)} sampled elevations, {min(values)} to {max(values)} m, {len(keys)} source tiles')
if __name__=='__main__':generate()
