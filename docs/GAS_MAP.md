# Gas Map data and display boundary

The Gas Map is a static, source-dated editorial snapshot of **pump gasoline**, with a separate diesel switch where the same published sources report diesel. It is not a live price feed and does not infer prices for blank parts of the map. `web/gas-price-data.js` contains the dated observations; the browser makes no calls to price APIs, sets no cookies, and sends no analytics.

The 16 October 2026 refresh contains 333 located observations. This is a refresh date, not a claim that every price was observed that day. Geographic resolution follows the source, rather than pretending that every region has the same granularity:

| Region | Reporting level | Source and observation date |
| --- | --- | --- |
| United States | 50 states and DC; ten selected cities | [AAA state averages](https://gasprices.aaa.com/state-gas-price-averages/), 16 October; [EIA city survey](https://www.eia.gov/petroleum/gasdiesel/), 12 October |
| Europe | 27 EU countries | [European Commission Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en), 12 October; matched inclusive/exclusive tables |
| Asia | 47 Japanese prefectures; one Delhi IOCL outlet; Taiwan CPC schedule | [Japan ANRE](https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/index.html) via [OpenGov](https://opengov.jp/en/prices/gasoline/), 5 October (latest available there); [India PPAC](https://ppac.gov.in/all-imp-news?page=1), 16 October; [Taiwan CPC](https://vipmbr.cpc.com.tw/mbwebs/showhistoryprice_oil.aspx), effective 12 October |
| Oceania | Eight Australian capital cities and 187 regional locations; New Zealand national board price | [ACCC 16 October report](https://www.accc.gov.au/system/files/weekly-fuel-price-monitoring-report-16-october-2026.pdf), observations 14 October; [NZ MBIE](https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/weekly-fuel-price-monitoring/price-for-fuel-response-support), **last verified week ending 27 September**, not current-week data |
| Islands | A view of island observations already included above | Hawaii, Taiwan, New Zealand, Tasmania/Hobart, Ireland, Malta, Cyprus, and four Japanese island-prefecture observations. This is **not** comprehensive island-world coverage. |

Five Australian ACCC regional locations (Mt Isa, Whitsunday, Mt Gambier, Victor Harbour, Koo Wee Rup) remain unplotted because the source names did not match confidently to a point in the [GeoNames Australia gazetteer](https://download.geonames.org/export/dump/AU.zip). Their omission is recorded in the generated payload rather than silently assigning a wrong location. Some national and published-schedule observations are plotted at a capital as a *locator*, not as a claim about that city's price. Natural Earth provides country shapes; the U.S. state and Japanese prefecture shapes are used only to position reporting-area markers.

The source's original local-currency price and unit remain in the data payload. The map, tooltip, list, and selected-place headline show an indicative **USD per U.S. gallon** conversion. The selected-place panel separately shows the same converted price in **USD per litre**. Tower height and color use USD per U.S. gallon:

`price_USD_per_litre = local_price × (USD_per_EUR / local_currency_per_EUR) ÷ litres_per_reported_unit`

`price_USD_per_US_gallon = price_USD_per_litre × 3.785411784`

The unit divisor is 3.785411784 for a U.S. gallon and 1 for a litre. [ECB reference rates](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml) dated 16 October 2026 provide most currencies. Taiwan uses the [CBC TWD/USD closing rate](https://www.cbc.gov.tw/tw/lp-645-1-1-40.html) of 32.338 on that date and the ECB USD/EUR rate. These conversions do not equal contemporaneous local purchasing power or compare like-for-like fuel grades: U.S. regular, EU Eurosuper 95, Japanese regular, Australian regular unleaded, NZ 91, and CPC 92 differ. State averages, city surveys, a single outlet, and a published schedule also have different sampling boundaries. Do not rank places as if these were one harmonized survey.

## Included taxes

Tax-inclusive pump totals remain unchanged by the split. Warm/blue lower segments show the before-tax price **only where a full breakdown exists**; striped magenta upper segments show included taxes. Unknown amounts are `null`, never zero, and remain unsplit. The inspector and tooltip disclose the distinction; a missing magenta cap does not mean tax-free fuel.

- **EU (27 places / 54 fuel components):** tax equals the same-country, same-fuel, same-date inclusive price minus the exclusive price. Both workbook headers must say EUR per 1,000 litres and have the identical observation date. Filename dates are not trusted; the current workbooks have older-looking persistent filenames. The inspector links the actual exclusive-price workbook.
- **Australia (195 places / 390 fuel components):** a calculated split, not a separately surveyed component. The current ACCC report confirms excise of AUD 0.537/litre, fully restored on 3 August 2026. [ACCC tax methodology](https://www.accc.gov.au/consumers/petrol-and-fuel/what-affects-fuel-prices) states that GST is 1/11 of the tax-inclusive retail price. Thus tax = 0.537 + retail price/11, and before-tax = retail price − tax. Review both the rate and its effective period for each future refresh. Consumer pump taxes are shown before any purchaser-specific tax credits.
- **Other sources:** taxes are included in their retail pump observations, but this capture does not provide a comparable full tax decomposition. Do not infer a complete tax total from just a VAT/GST rate or subtract a national tax rate from geographically variable prices.

Schema 2 stores each fuel's amount, before-tax price, method, source key, date and coverage under `tax_components`. Null means unquantified, not exempt. Total height remains linear and capped at $10/US gallon: tax segments above the ceiling are clipped, not compressed into the remaining height. Inspector bars use the complete uncapped composition. The national reverse-map view uses the same amounts and restores the tax cap at the outward end of the column.

**New Zealand limitation:** MBIE's page and public CSV returned HTTP 403 during this refresh. The newest verifiable official indexed publication is NZD 3.38/litre for the week ending 27 September. Its date and warning remain visible, including in the inspector; it is not relabelled as an October price. No third-party market estimate substitutes for that official series.

## Updating the snapshot

`src/refresh_gas_prices.py` refreshes the existing located observations without rebuilding their geographical joins. Capture `aaa.html`, `eia.html`, `japan.html`, `india.html`, `taiwan.html`, `cbc.html`, `fx.html` (ECB XML), `eu-with.xlsx`, `eu-without.xlsx`, and `accc-web-extract.txt` (both complete ACCC tables 6–7). The October ACCC source was extracted from the publicly retrievable PDF text because a direct binary request returned 403. Table coverage and every existing location join are checked. [Reviewed source notes](fuel-price-source-notes.json), copied into the capture directory as `source-notes.json`, record source URLs, ACCC excise/date verification and explicitly dated last-verified observations. Preserve captures privately for reproducibility; their SHA-256 inventory and source dates are generated in [fuel-price-refresh.json](fuel-price-refresh.json).

The older `src/build_gas_prices.py` is the September bootstrap, not a current-price refresh. It must not overwrite an existing schema-2 snapshot. Never replace current values with its old manually declared MBIE/PPAC/CPC values.

Install project requirements, then run:

```bash
python3 -m src.refresh_gas_prices --source-dir /path/to/captures --as-of YYYY-MM-DD
# Copy only the fuel assets during a scoped release; a full atlas rebuild is optional.
python3 -m unittest discover -s tests
node tests/test_gas_prices.cjs
```

Inspect outliers, dates, tax arithmetic and changed grades before publishing. Update the reviewed notes, regenerate the audit and synchronize the five fuel assets in `outputs/web`; retain unrelated atlas content. The page remains static and makes no runtime price requests.
