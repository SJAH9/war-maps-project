# Data refresh · 21 September 2026

This audit distinguishes a changed source from a source that was checked and remained current. A retrieval date records a successful fetch; a verification date records a comparison against the publisher without pretending that unchanged or access-limited data was newly downloaded.

| Source family | Result | Published boundary now used |
| --- | --- | --- |
| UCDP/PRIO Armed Conflict | Verified and hashed | v26.1, 1946–2025 |
| UCDP Georeferenced Event Dataset | Updated | v26.1, 1989–2025 |
| UCDP Candidate Events | Verified current | January–August 2026, reconciled by event ID |
| V-Dem | Updated from the official `vdemdata` release | v16, through 2025 |
| World Bank crude birth rate | Re-fetched; upstream revisions retained | 1960–2024 |
| World Bank total population | Re-fetched; byte-identical | 1960–2025 |
| OWID long-run life expectancy | Re-fetched; byte-identical | 1543–2023 where available |
| CelesTrak ICEYE subset | Updated from the active GP catalog | 52 active public objects, frozen 2026-09-21 |
| Natural Earth 1:110m | Verified unchanged | Cartographic reference geometry only |
| IHME GBD | Verified as the loaded release | GBD 2023 mortality and fertility, 1980–2023; publisher export requires IHME access |
| Organization rosters | Revalidated | UN 193, NATO 32, BRICS 11, EU 27, ASEAN 11; selected WEF entities refreshed |
| Pump fuel prices | Retained as a dated editorial snapshot | 18 September 2026 build with source-native dates; no old value was relabelled as live |
| ICEYE operator relationship | Link revalidated | Constellation-level statement only |

Machine-readable provenance, hashes, retrieval dates, and source URLs are in [`data/SOURCES.json`](../data/SOURCES.json). The human-readable measurement and inference boundaries are in [`docs/SOURCES.md`](SOURCES.md) and the Evidence guide in the web output.

## NewsMedia source boundary

The NewsMedia section vendors the three-file standalone NewsBoob player from `SJAH9/newsboob` at commit `3614240`. It requests the selected publisher's live HLS stream but does not ingest that broadcast into War Maps. The parent project adds no analytics or advertising profile; stream playback necessarily contacts the broadcaster and its delivery providers.
