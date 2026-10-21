"""Capture public inputs without replacing usable atlas data on request failures."""
import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from src.refresh_sources import fetch

ROOT = Path(__file__).resolve().parents[1]

def capture(directory):
    directory.mkdir(parents=True, exist_ok=True)
    fuel = json.JSONDecoder().raw_decode((ROOT/'web/gas-price-data.js').read_text().split('=', 1)[1])[0]
    jobs = {key+'.html': value for key, value in fuel['sources'].items()
            if key in ('aaa', 'eia', 'japan', 'india', 'taiwan', 'nz', 'fx')}
    jobs.update({'cbc.html': fuel['sources']['taiwan_fx'],
                 'eu-with.xlsx': fuel['sources']['eu_with_tax'],
                 'eu-without.xlsx': fuel['sources']['eu_before_tax'],
                 'accc.pdf': fuel['sources']['accc'],
                 'satellites.json': 'https://celestrak.org/NORAD/elements/gp.php?GROUP=sar&FORMAT=JSON',
                 'drone-incidents.json': 'https://iranattacks.com/incidents.json',
                 'world.geojson': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'})
    def one(item):
        name, url = item
        result = {'file': name, 'url': url, 'checked_at': datetime.now(timezone.utc).isoformat()}
        try:
            try:
                content = fetch(url)
                result['transport'] = 'urllib'
            except Exception as error:
                if 'CERTIFICATE_VERIFY_FAILED' not in str(error):
                    raise
                # Use the system trust store; never disable TLS verification.
                content = subprocess.check_output(['curl', '--fail', '--location', '--silent',
                                                  '--show-error', '--max-time', '60', url])
                result['transport'] = 'curl-system-trust'
            (directory/name).write_bytes(content)
            result.update(status='captured', sha256=hashlib.sha256(content).hexdigest(), bytes=len(content))
        except Exception as error:
            result.update(status='unavailable', error=str(error))
        print(name, result['status'], flush=True)
        return result
    results = list(ThreadPoolExecutor(max_workers=4).map(one, jobs.items()))
    (directory/'capture-audit.json').write_text(json.dumps(results, indent=2)+'\n')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    capture(parser.parse_args().directory)
