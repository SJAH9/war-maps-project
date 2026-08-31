# Sources and evidence boundaries

## UCDP/PRIO Armed Conflict Dataset 26.1

The historical spine is the UCDP/PRIO Armed Conflict Dataset version 26.1. It defines a state-based armed conflict as a contested incompatibility concerning government or territory where armed force between two parties, at least one a state government, results in at least 25 battle-related deaths in a calendar year. The project preserves UCDP fields and identifiers in its processed output.

Citation and downloads: <https://ucdp.uu.se/downloads/>

UCDP datasets are licensed CC BY 4.0. The War Maps Project does not relicense those records under MIT.

## UCDP Candidate Events 2026

The live layer combines the January-June 2026 quarterly release with the July 2026 monthly release. Rows are reconciled by stable UCDP event ID, with the newer monthly form replacing an overlapping quarterly row. The resulting 11,867 unique observations and all 485 candidate conflict clusters are retained in the generated data and made navigable in the atlas.

Candidate observations are provisional. `code_status`, source count, source office, source headline, date precision, location precision, dyad identifiers, violence type, and low/best/high fatality estimates are retained. A `Clear` event is not transformed into an unrestricted fact; it remains clear within the candidate UCDP enclosure.

## V-Dem country-year conditions

The first project build uses the V-Dem v15 country-year core retained by the RTLDI Atlas pipeline. Its nine protection fields are nested around Uppsala conflict-years as observed state conditions. V-Dem supplies conditions; it is not used as an external authority that closes the projection.

The government-type overlay uses the V-Dem v15 Regimes of the World field `v2x_regime`, retained with `v2x_regime_amb` from the official local country-year archive. The displayed values preserve the source categories: Closed Autocracy, Electoral Autocracy, Electoral Democracy, and Liberal Democracy. They are country-year observations, not permanent descriptions of a country.

## Relationship and casualty boundaries

Nation-page “same-side” relationships mean that governments appeared on the same coded UCDP side in at least one conflict-year. “Opposing state” relationships mean they appeared on opposing coded sides. Neither is relabeled as a permanent diplomatic alliance or enduring hostility.

The historical Armed Conflict Dataset does not provide spending or event-level fatality totals. Related-data panels therefore mark spending and historical casualty totals unavailable. Fatality ranges shown for 2026 sum the low, best, and high observations in the loaded UCDP Candidate Events data. Territorial totals describe event locations and do not assign every death to a nationality.

## IHME GBD 2023 mortality and fertility

The Life and Death view includes two separately downloaded Global Burden of Disease Study 2023 Results exports. All-cause mortality is the modeled age-standardized death rate for both sexes, expressed as deaths per 100,000, with lower and upper uncertainty bounds. Period total fertility rate is derived as five times the sum of the female age-specific fertility rates across the eight five-year age groups from 10-14 through 45-49. The interface reports births per woman and retains the derived lower and upper sums in its data layer.

The health series cover 1980-2023. They are not contemporaneous with the provisional 2026 UCDP event layer, are not used to infer responsibility for conflict, and are not added to fatality totals. The isometric display provides independent toggles and normalizes each visible metric independently only for visual height because fatality counts, mortality rates, and fertility rates do not share a unit. It uses one fixed phi-accelerated block form rather than selectable linear, square-root, or logarithmic scales: block frequency follows a phi-power response, while individual block height rises from 1 scene unit at the surface to φ at the eighteenth level.

Citation: Global Burden of Disease Collaborative Network. *Global Burden of Disease Study 2023 (GBD 2023) Results.* Seattle, United States: Institute for Health Metrics and Evaluation (IHME), 2024. Available from <https://vizhub.healthdata.org/gbd-results/>. IHME source terms apply; the raw exports are not committed to this repository.

## Public satellite geometry

The optional satellite layer uses a frozen 2026-08-29 subset of CelesTrak's public SAR general-perturbations catalog. The browser propagates those orbital elements around their catalog epoch to draw approximate ground tracks. The layer is a cartographic reference, not a live operational feed, pass alert, or claim about tasking.

The initial relationship is supported by ICEYE's statement that it expanded the Ukrainian Ministry of Defence's access to the ICEYE SAR satellite constellation. That is a constellation-level relationship. It does not establish that every publicly catalogued ICEYE spacecraft supplied imagery to a particular operation. The generated atlas preserves that boundary in `individual_asset_boundary` and keeps the orbit records free of conflict identifiers.

CelesTrak GP formats: <https://celestrak.org/NORAD/documentation/gp-data-formats.php>

ICEYE operator statement: <https://www.iceye.com/newsroom/press-releases/ukraine-expands-partnership-with-iceye>

## What is not inferred

The atlas does not use its contextual health series or other outside data streams to close initiation, intent, territorial gain, economic gain, force strength, equipment, or battlefield questions. User prompts open those questions, and NCM carries the projection through Uppsala and V-Dem observations toward the causal head while retaining every intermediate enclosure.
