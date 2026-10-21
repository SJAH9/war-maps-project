"""Refresh independently available fuel captures; retain blocked source records."""
import argparse
import copy
import json
import re
import math
from datetime import datetime
from xml.etree import ElementTree
from src.refresh_gas_prices import ROOT, FUELS, BeautifulSoup, read_payload, table_rows, euro_table, tax_breakdown


def parse(source, directory):
    if source == 'eu':
        dated, prices = euro_table(directory/'eu-with.xlsx')
        net_date, net = euro_table(directory/'eu-without.xlsx')
        if dated != net_date:
            raise ValueError('Tax pair dates differ')
        for name, values in prices.items():
            values['tax_components'] = {f: tax_breakdown(values[f], net[name][f],
                'published difference: tax-inclusive minus tax-exclusive EU observation',
                'eu_before_tax', dated) for f in FUELS}
        return dated, prices
    text = (directory/(source+'.html')).read_text()
    if source == 'taiwan':
        schedules = []
        for fields in table_rows(text):
            if len(fields) >= 5 and re.fullmatch(r'\d{4}/\d{1,2}/\d{1,2}', fields[0]) and fields[1] and fields[4]:
                dated = datetime.strptime(fields[0], '%Y/%m/%d').date().isoformat()
                schedules.append((dated, dict(gasoline=float(fields[1]), diesel=float(fields[4]))))
        dated, prices = max(schedules, key=lambda row: row[0])
        return dated, {'Taiwan (CPC schedule)': prices}
    if source == 'aaa':
        dated = datetime.strptime(re.search(r'Price as of\s*(\d{1,2}/\d{1,2}/\d{2})', text)[1], '%m/%d/%y').date().isoformat()
        return dated, {r[0]: dict(gasoline=float(r[1].strip('$')), diesel=float(r[4].strip('$')))
                       for r in table_rows(text) if len(r) >= 5 and r[1].startswith('$')}
    if source == 'eia':
        dated = max(datetime.strptime(d, '%m/%d/%y').date().isoformat()
                    for d in re.findall(r'\b\d{2}/\d{2}/\d{2}\b', text))
        prices = {}
        for r in table_rows(text):
            if len(r) >= 4:
                try:
                    prices[r[0]] = dict(gasoline=float(r[3]))
                except ValueError:
                    pass
        return dated, prices
    soup = BeautifulSoup(text, 'html.parser')
    if source == 'japan':
        dated = re.search(r'Survey date:\s*(\d{4}-\d{2}-\d{2})', soup.get_text(' ', strip=True))[1]
        prices = {}
        for r in soup.select('tr[data-pref-name]'):
            cells = [c.get_text(' ', strip=True) for c in r.select('td')]
            prices[r['data-pref-name'].split('(')[0].strip()] = dict(gasoline=float(cells[3]), diesel=float(cells[5]))
        return dated, prices
    if source == 'india':
        plain = soup.get_text(' ', strip=True)
        dates, prices = [], {}
        for fuel, label in [('gasoline', 'Petrol'), ('diesel', 'Diesel')]:
            match = re.search(r'RSP of '+label+r' in Delhi as per IOCL outlet as on (\d{1,2}-[A-Za-z]+-\d{4}),\s*Rs\.\s*([\d.]+)/ltr', plain)
            dates.append(datetime.strptime(match[1], '%d-%B-%Y').date().isoformat())
            prices[fuel] = float(match[2])
        if len(set(dates)) != 1:
            raise ValueError('Fuel observation dates differ')
        return dates[0], {'Delhi (IOCL outlet)': prices}
    raise ValueError('Unsupported source')


def refresh(directory, as_of, output):
    datetime.strptime(as_of, '%Y-%m-%d')
    data = read_payload(output)
    audit = []
    for source in ('aaa', 'eia', 'eu', 'japan', 'india', 'taiwan'):
        try:
            dated, prices = parse(source, directory)
            rows = [r for r in data['observations'] if r['source'] == source]
            if not rows or dated > as_of or any(dated < r['date'] for r in rows):
                raise ValueError('Missing rows or invalid observation date')
            # Validate all rows before mutating any observations from this source.
            for row in rows:
                values = prices[row['name']]
                for fuel in FUELS:
                    if row.get(fuel) is not None and (fuel not in values or not math.isfinite(values[fuel]) or not 0 < values[fuel] < 10000):
                        raise ValueError('Missing or invalid fuel price')
            before = copy.deepcopy(rows)
            for row in rows:
                values = prices[row['name']]
                changed = dated != row['date'] or any(row.get(f) != values.get(f) for f in FUELS if f in values)
                if changed:
                    row.update(values, date=dated, tax_included=True)
                    row['tax_components'] = values.get('tax_components', {f: None for f in FUELS if row.get(f) is not None})
            status = 'updated' if rows != before else 'unchanged'
            data['source_updates'][source] = dict(observation_date=dated, observations=len(rows), checked_on=as_of, status=status)
            audit.append(dict(source=source, status=status, observation_date=dated, observations=len(rows)))
        except Exception as error:
            audit.append(dict(source=source, status='retained', error=str(error)))
    try:
        node = next(n for n in ElementTree.fromstring((directory/'fx.html').read_bytes()).iter() if 'time' in n.attrib)
        if not data['fx_date'] <= node.attrib['time'] <= as_of:
            raise ValueError('Invalid FX date')
        rates = {n.attrib['currency']: float(n.attrib['rate']) for n in node if 'currency' in n.attrib}
        rates['EUR'] = 1
        if any(not math.isfinite(v) or v <= 0 for v in rates.values()):
            raise ValueError('Invalid FX rate')
        # Preserve the dated TWD/USD cross-rate if CBC is unavailable.
        twd_per_usd = data['currency_per_eur']['TWD'] / data['usd_per_eur']
        cbc_date = data['taiwan_fx_date']
        try:
            cbc = [(r[0].replace('/', '-'), float(r[1]))
                   for r in table_rows((directory/'cbc.html').read_bytes())
                   if len(r) >= 2 and re.fullmatch(r'\d{4}/\d{2}/\d{2}', r[0])]
            new_date, new_rate = max(cbc)
            if not cbc_date <= new_date <= as_of or not math.isfinite(new_rate) or new_rate <= 0:
                raise ValueError('Invalid CBC observation')
            cbc_date, twd_per_usd = new_date, new_rate
        except Exception as error:
            audit.append(dict(source='cbc', status='retained', error=str(error)))
        rates['TWD'] = round(twd_per_usd * rates['USD'], 8)
        if any(r['currency'] not in rates for r in data['observations']):
            raise ValueError('Missing currency')
        data.update(currency_per_eur=rates, usd_per_eur=rates['USD'], fx_date=node.attrib['time'], taiwan_fx_date=cbc_date)
        audit.append(dict(source='ecb', status='verified', observation_date=data['fx_date'], taiwan_fx_date=cbc_date))
    except Exception as error:
        audit.append(dict(source='ecb', status='retained', error=str(error)))
    for source in ('accc', 'nz'):
        audit.append(dict(source=source, status='retained',
                          observation_date=data['source_updates'][source]['observation_date'],
                          note='No replacement imported; see capture audit and publisher release check.'))
    data['snapshot'] = as_of
    data['refresh_audit'] = audit
    output.write_text('window.GAS_PRICE_DATA='+json.dumps(data, ensure_ascii=False, separators=(',', ':'))+';\n')
    (ROOT/'docs'/f'fuel-price-refresh-{as_of}.json').write_text(json.dumps(audit, indent=2)+'\n')
    print(json.dumps(audit, indent=2))


if __name__ == '__main__':
    from pathlib import Path
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--as-of', required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'web/gas-price-data.js')
    args = parser.parse_args()
    refresh(args.source_dir, args.as_of, args.output)
