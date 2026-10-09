"""Build a deliberately bounded, auditable Iranian drone report layer."""
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://iranattacks.com/incidents.json'

def include(row):
    text = row['title'] + ' ' + row['summary']
    # A source-mention screen, not an attribution classifier. Preserve evidence.
    return (bool(re.search(r'drone', row['attackType'] + ' ' + row['title'], re.I))
            and bool(re.search(r'\b(Iranian|Iran|IRGC)\b', text, re.I))
            and not re.search(r'Hezbollah|Houthi|Iran.backed|Iran.aligned|militia|suspected', text, re.I))

def build(raw):
    rows = json.loads(raw)
    selected = []
    for r in rows:
        if not include(r):
            continue
        mixed = bool(re.search(r'mixed|missile|rocket', r['attackType'], re.I))
        selected.append({**r, 'weaponScope': 'Mixed weapons' if mixed else 'Drone-specific report'})
    return {'source': URL, 'sourceName': 'Iran Attacks Map', 'license': 'CC BY 4.0',
            'retrieved': datetime.now(timezone.utc).isoformat(),
            'sha256': hashlib.sha256(raw).hexdigest(), 'sourceRows': len(rows),
            'selection': 'Drone mention plus explicit Iran/IRGC attribution in source title or summary; excludes named proxy, Iran-backed, Iran-aligned and suspected records. Text screen is not independent attribution verification; incomplete subset, not a historical census.',
            'incidents': selected}

if __name__ == '__main__':
    raw = subprocess.check_output(['curl', '-fsS', '--max-time', '30', URL])
    output = ROOT / 'web/assets/iran-drones.json'
    output.write_text(json.dumps(build(raw), ensure_ascii=False, indent=2) + '\n')
    print(output)
