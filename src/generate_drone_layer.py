"""Sourced drone-event overlay; never changes UCDP's underlying records."""
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
URL='https://iranattacks.com/incidents.json'
def selected(r):
    text=r['title']+' '+r['summary']
    return (re.search('drone',r['attackType']+' '+r['title'],re.I)
            and not re.search('mixed|missile|rocket',r['attackType'],re.I)
            and re.search(r'\b(Iranian|Iran|IRGC)\b',text,re.I)
            and not re.search(r'Hezbollah|Houthi|Iran.backed|Iran.aligned|militia|suspected',text,re.I))
if __name__=='__main__':
    raw=subprocess.check_output(['curl','-fsS','--max-time','30',URL]);rows=json.loads(raw)
    result={'source':URL,'sourceName':'Iran Attacks Map','license':'CC BY 4.0','retrieved':datetime.now(timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'selection':'Drone-specific type/title plus explicit Iran/IRGC mention; excludes mixed weapons, named proxies, Iran-backed/aligned and suspected records. Incomplete text-screened source subset, not independently verified attribution or a historical census. Interceptions and claimed targeting remain distinct in the original reports.','incidents':[r for r in rows if selected(r)]}
    (ROOT/'web/assets/drone-event-layer.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n');print(len(result['incidents']),'drone-specific source reports')
