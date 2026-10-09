# Data refresh · 8 October 2026

Official downloads were fetched again, validated before replacement, and compared by SHA-256. The machine-readable results, URLs and before/after hashes are in [`data/refresh-2026-10-08.json`](../data/refresh-2026-10-08.json). Unchanged files retain their original retrieval dates and receive a new verification date.

| Source | Result | Boundary |
| --- | --- | --- |
| UCDP/PRIO Armed Conflict | Download byte-identical | 26.1, 1946–2025 |
| UCDP GED | Download byte-identical | 26.1, 1989–2025 |
| UCDP Candidate Events | All three downloads byte-identical | January–August 2026 |
| World Bank population | Download byte-identical | 1960–2025 |
| World Bank crude birth rate | Updated upstream response; 152 aggregate-year values differ; retained country/economy observations unchanged | 1960–2024 |
| OWID long-run life expectancy | Download byte-identical | 1543–2023, country availability varies |
| V-Dem | Official release listing checked; v16 remains latest; retained extracts were not regenerated | Through 2025 |
| IHME mortality and fertility | Retained, not freshly exported; requires publisher access | GBD 2023 |
| Natural Earth, frozen ICEYE geometry, organization rosters, fuel-price and curated context layers | Retained; not newly verified in this pass | Existing source-native dates remain visible |

The [official UCDP downloads page](https://ucdp.uu.se/downloads/) still lists August 2026 as the latest Candidate release at this check. No September observations have been invented or inferred. The [official V-Dem release listing](https://github.com/vdeminstitute/vdemdata/releases) identifies v16 as latest.

The refresh rebuilds demographic assets and the deployable web atlas, preserving source units, missing data, candidate-event reconciliation and inference boundaries. Existing print PDFs remain dated artifacts and were not regenerated. This is not a claim that every layer is current to October.

## Repeatable refresh

Run `python3 -m src.refresh_sources` to re-fetch the explicitly configured public files. It validates required CSV columns, ZIP integrity and complete World Bank pagination before writing a replacement. Failed requests leave the loaded record untouched and appear as unavailable in the audit. Publisher release listings must still be checked before adding a new release; the script does not guess unpublished URLs.
