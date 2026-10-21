"""Validate and archive public ICEYE reference elements, not live tasking data."""
import argparse
import hashlib
import json
import math
from datetime import date, datetime
from pathlib import Path
from src.build_atlas import ROOT


def import_snapshot(path, snapshot):
    dated = date.fromisoformat(snapshot)
    rows = json.loads(path.read_bytes())
    objects = [row for row in rows if row.get('OBJECT_NAME', '').startswith('ICEYE')]
    if not objects or len({row['NORAD_CAT_ID'] for row in objects}) != len(objects):
        raise ValueError('Empty or duplicate satellite catalog')
    for row in objects:
        epoch = datetime.fromisoformat(row['EPOCH']).date()
        if not 0 <= (dated - epoch).days <= 30:
            raise ValueError('Orbit epoch is outside the snapshot window')
        for field in ('MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE',
                      'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'):
            if not math.isfinite(float(row[field])):
                raise ValueError('Invalid orbit element')
        if row['MEAN_MOTION'] <= 0 or not 0 <= row['ECCENTRICITY'] < 1:
            raise ValueError('Invalid orbital shape')
    target = ROOT/'data/raw'/f'CelesTrak-ICEYE-SAR-{snapshot}.json'
    content = (json.dumps(objects, indent=2)+'\n').encode()
    if target.exists() and target.read_bytes() != content:
        raise ValueError('Refusing to replace a different dated snapshot')
    target.write_bytes(content)
    relations = ROOT/'data/curated/satellite_relations.json'
    payload = json.loads(relations.read_text())
    for row in payload['constellations']:
        row['orbit_snapshot'] = snapshot
    relations.write_text(json.dumps(payload, indent=2)+'\n')
    print(target, len(objects), hashlib.sha256(content).hexdigest())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture', type=Path)
    parser.add_argument('--snapshot', required=True)
    args = parser.parse_args()
    import_snapshot(args.capture, args.snapshot)
