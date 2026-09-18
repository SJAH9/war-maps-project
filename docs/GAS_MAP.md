# Gas Map data and display boundary

The Gas Map is a static, source-dated editorial snapshot of **pump gasoline**, with a separate diesel switch where the same published sources report diesel. It is not a live price feed and does not infer prices for blank parts of the map. `web/gas-price-data.js` contains the dated observations; the browser makes no calls to price APIs, sets no cookies, and sends no analytics.

The 18 September 2026 snapshot contains 333 located observations. Geographic resolution follows the source, rather than pretending that every region has the same granularity:

| Region | Reporting level | Source and observation date |
| --- | --- | --- |
| United States | 50 states and DC; ten selected cities | [AAA state averages](https://gasprices.aaa.com/state-gas-price-averages/), 18 September; [EIA city survey](https://www.eia.gov/petroleum/gasdiesel/), 14 September |
| Europe | 27 EU countries | [European Commission Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en), 14 September |
| Asia | 47 Japanese prefectures; one Delhi IOCL outlet; Taiwan CPC schedule | [Japan ANRE](https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/index.html) via [OpenGov](https://opengov.jp/en/prices/gasoline/), 14 September; [India PPAC](https://ppac.gov.in/all-imp-news?page=1), 17 September; [Taiwan CPC](https://vipmbr.cpc.com.tw/mbwebs/showhistoryprice_oil.aspx), effective 14 September |
| Oceania | Eight Australian capital cities and 187 regional locations; New Zealand national board price | [ACCC weekly monitoring report](https://www.accc.gov.au/system/files/weekly-fuel-price-monitoring-report-18-september-2026.pdf), 16 September; [NZ MBIE](https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/weekly-fuel-price-monitoring/price-for-fuel-response-support), week ending 13 September |
| Islands | A view of island observations already included above | Hawaii, Taiwan, New Zealand, Tasmania/Hobart, Ireland, Malta, Cyprus, and four Japanese island-prefecture observations. This is **not** comprehensive island-world coverage. |

Five Australian ACCC regional locations (Mt Isa, Whitsunday, Mt Gambier, Victor Harbour, Koo Wee Rup) remain unplotted because the source names did not match confidently to a point in the [GeoNames Australia gazetteer](https://download.geonames.org/export/dump/AU.zip). Their omission is recorded in the generated payload rather than silently assigning a wrong location. Some national and published-schedule observations are plotted at a capital as a *locator*, not as a claim about that city's price. Natural Earth provides country shapes; the U.S. state and Japanese prefecture shapes are used only to position reporting-area markers.

The displayed local price is primary. Tower height and color are only an indicative cross-currency comparison in USD per litre:

`price_USD_per_litre = local_price × (USD_per_EUR / local_currency_per_EUR) ÷ litres_per_reported_unit`

The unit divisor is 3.785411784 for a U.S. gallon and 1 for a litre. [ECB reference rates](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml) dated 18 September 2026 provide most currencies. Taiwan uses the [CBC TWD/USD closing rate](https://www.cbc.gov.tw/tw/lp-645-1-1-40.html) on that date and the ECB USD/EUR rate. These conversions do not equal contemporaneous local purchasing power or compare like-for-like fuel grades: U.S. regular, EU Eurosuper 95, Japanese regular, Australian regular unleaded, NZ 91, and CPC 92 differ. State averages, city surveys, a single outlet, and a published schedule also have different sampling boundaries. Do not rank places as if these were one harmonized survey.

## Updating the snapshot

`src/build_gas_prices.py` reads a set of locally downloaded, dated source files. Download the latest source pages/tables into a temporary directory using the filenames referenced by the script (`war-maps-aaa.html`, `war-maps-eia.html`, `war-maps-eu-prices.xlsx`, `war-maps-japan-prices.html`, `war-maps-accc.txt`, `war-maps-geonames-au.zip`, `war-maps-ecb.xml`, `war-maps-us-states.json`, and `war-maps-japan-prefectures.geojson`). Extract the ACCC PDF text with layout preserved. Recheck the MBIE, PPAC, CPC, and CBC values and dates that are currently declared explicitly in the script before generating a new snapshot. The parser deliberately fails if expected row counts or joins change.

Install `openpyxl` for the EU workbook, then run:

```bash
python3 -m src.build_gas_prices --source-dir /path/to/downloads
python3 -m src.generate_web_atlas
python3 -m unittest discover -s tests
```

Inspect outliers, unmatched locations, publication dates, and changed grades before publishing a new snapshot. Refresh the `snapshot` date in the script and this document only after that check. Do not relabel an old price as current. The page is intentionally static so it works on GitHub Pages without a server-side collector.
