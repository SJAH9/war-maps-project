"""Build a frozen, retrospective satellite comparison from archived GP elements."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NAMES=('ICEYE-X36','COSMOS 2612')
def epoch(value):
    return datetime.fromisoformat(value.replace('Z','+00:00')).replace(tzinfo=timezone.utc)
def build():
    records={name:[] for name in NAMES}
    for path in sorted((ROOT/'data/raw').glob('CelesTrak*.json')):
        for row in json.loads(path.read_text()):
            if row.get('OBJECT_NAME') in records:
                records[row['OBJECT_NAME']].append((row,str(path.relative_to(ROOT))))
    if any(not values for values in records.values()):raise ValueError('Both satellite element sets are required')
    selected=[max(records[name],key=lambda pair:epoch(pair[0]['EPOCH'])) for name in NAMES]
    end=min(epoch(row['EPOCH']) for row,_ in selected)
    return dict(start=(end-timedelta(days=30)).isoformat(),end=end.isoformat(),step_minutes=5,
        method='SGP4 retrospective model from the latest archived element set for each spacecraft. Not an observed position history. No maneuver history is available; uncertainty grows away from the element epochs.',
        source_url='https://celestrak.org/NORAD/documentation/gp-data-formats.php',
        objects=[dict(elements=row,archive=path,available_snapshots=len(records[row['OBJECT_NAME']])) for row,path in selected])
def generate():
    data=build()
    for folder in ('web','outputs/web'):
        (ROOT/folder/'satellite-proximity-data.js').write_text('window.WAR_MAPS_ORBITS='+json.dumps(data,separators=(',',':'))+';\n')
    return data
if __name__=='__main__':generate()
