"""Download Natural Earth geometry and retain the Hormuz regional window."""
import hashlib,json
from pathlib import Path
from urllib.request import urlopen

ROOT=Path(__file__).resolve().parents[1]
URL='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson'

def clip(ring):
    points=ring
    for axis,bound,lower in [(0,40,True),(0,61,False),(1,10,True),(1,30,False)]:
        output=[]
        for a,b in zip(points,points[1:]+points[:1]):
            inside_a=a[axis]>=bound if lower else a[axis]<=bound
            inside_b=b[axis]>=bound if lower else b[axis]<=bound
            if inside_a:output.append(a)
            if inside_a!=inside_b:
                t=(bound-a[axis])/(b[axis]-a[axis]);output.append([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])])
        points=output
        if not points:return []
    if points[0]!=points[-1]:points.append(points[0])
    return points

def main():
    content=urlopen(URL,timeout=60).read();data=json.loads(content);features=[]
    for f in data['features']:
        polygons=f['geometry']['coordinates'] if f['geometry']['type']=='MultiPolygon' else [f['geometry']['coordinates']]
        retained=[]
        for polygon in polygons:
            outer=clip(polygon[0])
            if len(outer)>=4:retained.append([outer]+[h for r in polygon[1:] if len(h:=clip(r))>=4])
        if retained:features.append({'type':'Feature','properties':{'name':f['properties']['ADMIN']},'geometry':{'type':'MultiPolygon','coordinates':retained}})
    payload={'type':'FeatureCollection','features':features,'source':{'url':URL,'sha256':hashlib.sha256(content).hexdigest(),'resolution':'Natural Earth 1:10m','window':[40,10,61,30],'license':'Public domain'}}
    (ROOT/'web/assets/hormuz-land.json').write_text(json.dumps(payload,separators=(',',':'))+'\n')
    print(len(features),'regional country features')

if __name__=='__main__':main()
