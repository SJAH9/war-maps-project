# Data refresh · 18 November 2026

This audit separates newly imported observations, unchanged publisher files, retained observations, and unavailable checks. A refresh date is not assigned to an observation unless the publisher supplies that date.

## Updated

- **UCDP Candidate Events:** imported the official January-September cumulative file and September monthly file. Reconciliation by stable event ID produces 16,633 unique provisional observations in 540 candidate conflict clusters. The current Iran conflict contains 459 observations from 28 February through 23 September. SHA-256 values and publisher URLs are recorded in `data/SOURCES.json`.
- **Pump fuel:** rebuilt 333 located observations. Source dates are AAA and India 18 November; EIA and Taiwan 16 November; ACCC 11 November; EU and Japan 9 November; and NZ MBIE 8 November. ECB exchange rates are dated 17 November and the Taiwan exchange-rate observation is dated 18 November. The full source and capture inventory is in `fuel-price-refresh.json`.
- **oPt Health Cluster / WHO dashboard:** refreshed the frozen aggregate response through 15 November. It contains 1,136 casualty-date rows, 3,188 Gaza demographic rows, four period-share rows, and 2,137 health-attack rows. Latest cumulative figures are Gaza 74,702 fatalities and 176,105 injuries; West Bank 1,220 fatalities and 13,473 injuries. These records remain separate from UCDP and are not summed with it.
- **World Bank total population:** the official `SP.POP.TOTL` response changed and was replaced byte-for-byte. Coverage remains 1960-2025.
- **Public ICEYE geometry:** captured 52 public CelesTrak orbital records on 18 November. These are approximate cartographic reference geometry, not live positions or evidence of individual satellite tasking.

## Checked and unchanged

- UCDP/PRIO Armed Conflict Dataset 26.1 and UCDP GED 26.1 matched the retained files exactly.
- The Our World in Data long-run life-expectancy CSV matched the retained file exactly.
- Natural Earth Admin 0 geometry matched the retained capture exactly.
- The selected drone-incident source matched the retained capture exactly.

## Retained or unavailable

- The World Bank crude-birth-rate request timed out. The prior official response remains loaded and is not relabelled as newly verified.
- NZ MBIE blocked the automated capture with HTTP 403. The official indexed publication was separately verified at NZD 3.52/litre for the week ending 8 November, and remains marked `last_verified` in the generated payload.
- V-Dem v16, IHME GBD 2023 exports, and organization rosters were retained without a new full-archive comparison in this pass. Their existing source dates remain visible.

## Reproduction

```bash
python -m src.refresh_sources
python -m src.refresh_gas_prices --source-dir data/raw/fuel-2026-11-18 --as-of 2026-11-18
python -m src.import_health_dashboard --refresh
python -m src.build_atlas
python -m src.generate_population
python -m src.generate_web_atlas
```

The refresh does not infer missing observations, convert provisional candidate events into reviewed records, or collapse datasets with different methods and reporting boundaries.
