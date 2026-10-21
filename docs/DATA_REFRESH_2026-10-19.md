# Data refresh · 19 October 2026

Changes were made to build inputs and generators, then regenerated into the deployable atlas. Failed downloads do not replace usable observations. This is a source-by-source refresh, not a claim that all observations describe today.

| Source | Result | Loaded boundary / limitation |
| --- | --- | --- |
| UCDP/PRIO and GED 26.1 | Official downloads unchanged | Through 2025 |
| UCDP Candidate Events | All three official downloads unchanged; [release listing](https://ucdp.uu.se/downloads/) still ends at August | January–August 2026; no invented September layer |
| World Bank population | Updated response: 330 aggregate-row changes involving FCV and blank-ISO aggregate entries | Country observations and global series unchanged; response hash refreshed |
| World Bank crude birth rate | Byte-identical | Through 2024 |
| OWID long-run life expectancy | Byte-identical | Through 2023 where available |
| V-Dem | [Official archive](https://v-dem.net/data/dataset-archive/) still lists v16 | Retained extracts; no fresh full-archive comparison |
| IHME mortality/fertility | [Official GBD page](https://healthdata.org/gbd) still identifies GBD 2023 | Existing exports retained; publisher access needed to re-export |
| AAA U.S. fuel | Prices changed in all 51 located observations | 19 October; [source](https://gasprices.aaa.com/state-gas-price-averages/) |
| PPAC Delhi fuel | New dated petrol/diesel observation, prices unchanged | 19 October; [source](https://ppac.gov.in/all-imp-news?page=1) |
| Taiwan CPC fuel | New 19 October schedule, prices unchanged | [Source](https://vipmbr.cpc.com.tw/mbwebs/showhistoryprice_oil.aspx); TLS-validating curl retry succeeded |
| ECB / Taiwan CBC FX | Updated both to 19 October | [ECB](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml), [CBC](https://www.cbc.gov.tw/tw/lp-645-1-1-40.html) |
| EIA / EU / Japan fuel | Retrieved observations unchanged | 12 October / 12 October / 5 October respectively |
| Australia fuel | Retained | [ACCC listing](https://www.accc.gov.au/about-us/publications/weekly-fuel-price-monitoring-update) still identifies 16 October report; PDF re-download returned 403; existing 14 October observations retained |
| New Zealand fuel | Retained, unavailable | MBIE returned 403; last verified 27 September price remains explicitly dated |
| CelesTrak ICEYE | Updated 52 public orbit records | Frozen 19 October snapshot; epochs 18–19 October. Initial HTTP 500 recovered on TLS-validating curl retry. Not live positions or evidence of tasking |
| Drone-event overlay | Selected 54 records identical | Reapplied existing selection to [source feed](https://iranattacks.com/incidents.json); no observations changed |
| Natural Earth world / Hormuz land | Both byte-identical; regional geometry regenerated for comparison | Cartographic reference, not conflict evidence |
| Hormuz terrain | Unchanged | Python retrieval failed; TLS-validating curl retry verified all 72 tile hashes and all 168,821 grid values unchanged. Original retrieval timestamp preserved |
| Organization rosters | No verified roster change imported | Official UN/NATO/EU/ASEAN pages corroborate 193/32/27/11 members; BRICS and WEF pages unavailable. Counts are not a fresh full entity-by-entity revalidation |
| ICEYE relationship statement | Retained | [Operator statement](https://www.iceye.com/newsroom/press-releases/ukraine-expands-partnership-with-iceye) still supports the existing constellation-level relation |
| Curated claims, projections, basing and historical print context | Retained historical records | Not automatically replaced with unsourced current claims |
| Hormuz crossing/ship feeds and NewsMedia | Runtime sources | Browser retrieves these at use time; not baked into the static dataset |

## Reproduction and evidence

- Core source hashes and outcomes: [`data/refresh-2026-10-19.json`](../data/refresh-2026-10-19.json).
- Broader World Bank queries through 2026 confirmed the latest non-null population year is still 2025 and crude birth-rate year is still 2024.
- Fuel capture provenance: [`data/raw/fuel-2026-10-19/capture-audit.json`](../data/raw/fuel-2026-10-19/capture-audit.json). Successful fuel captures are archived beside it.
- Partial fuel importer: `python3 -m src.refresh_available_fuel --source-dir data/raw/fuel-2026-10-19 --as-of 2026-10-19`. It validates each source independently and retains unavailable sources. Its per-run audit distinguishes changes from repeat-run no-ops.
- Satellite archive: [`data/raw/CelesTrak-ICEYE-SAR-2026-10-19.json`](../data/raw/CelesTrak-ICEYE-SAR-2026-10-19.json), with hash in `data/SOURCES.json`. Earlier snapshots are preserved.
- Core commands: `python3 -m src.refresh_sources`, demographic generators, `python3 -m src.build_civilian_casualties`, `python3 -m src.generate_information_pages`, and `python3 -m src.generate_web_atlas`.

The four Iran print products were stale at July/125 observations. Their generators now use the loaded August/126 observations; hard-coded July metric/footer dates were replaced with the print specification's dates. The satellite visibility regression test now agrees with the intentionally restored optional control while retaining the evidence-separation checks.

## Validation

37 Python tests pass, including partial-source failure preservation and Taiwan schedule parsing. The Node fuel-price regression passes, checking tax conservation, missing-tax handling, dates and generated copies. A repeated web build is byte-identical across all 60 output files. All four rebuilt print products were rendered for visual review, and the current Iran proof was checked for removal of stale July labels. No changes have been pushed or deployed by this refresh.
