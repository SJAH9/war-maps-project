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

## World Bank / UN crude birth rate

The Life and Death view also includes World Development Indicators series `SP.DYN.CBRT.IN`, distributed by the World Bank under CC BY 4.0. Its primary source is the United Nations Population Division's *World Population Prospects*, supplemented by national statistical offices, Eurostat, and the United Nations Statistics Division. The displayed crude birth rate is annual live births divided by mid-year population, multiplied by 1,000. Loaded country observations cover 1960-2024.

Crude birth rate is not interchangeable with total fertility rate. The former is a population-wide annual rate per 1,000 people; the latter estimates births per woman across reproductive ages. They therefore receive separate controls, units, source disclosures, and independent visual normalization.

Indicator and citation metadata: <https://data.worldbank.org/indicator/SP.DYN.CBRT.IN>

Underlying UN demographic source: <https://population.un.org/wpp/>

## World Bank / UN total population

The Life and Death view includes World Development Indicators series `SP.POP.TOTL`, distributed by the World Bank under CC BY 4.0 and primarily sourced from UN World Population Prospects. The measure is the de facto population at mid-year. Loaded observations cover 1960-2025 and remain separate from conflict-fatality counts and population-health rates.

The north-side 3D metric rail uses the World Bank's `WLD` aggregate for the population total. Conflict is the sum of loaded candidate-event fatality estimates in the selected range. Mortality and fertility cannot be validly summed across country rates, so those rows report arithmetic means for displayed country observations. To keep the in-scene rail strictly typographic, it shows only metric names and numeric values; this methodology page supplies the aggregation context and units. Each row shares its metric toggle with the corresponding map stacks and disappears when that metric is disabled. The rail eases from the map plane into an upright stack, placing its rows on the same vertical axis used by the data columns.

Indicator and citation metadata: <https://data.worldbank.org/indicator/SP.POP.TOTL>

## Network-science transformations

The conflict network treats each currently displayed UCDP-derived relation as an undirected topological edge for structural analysis. Graphology computes connected components and normalized node betweenness; unique-neighbor degree, normalized degree centrality, density, and the observed degree distribution are calculated for the same selected conflict and date window. Node size increases sublinearly with degree.

“Hub” is an interface role for nodes in the visible graph's top degree decile. “Bottleneck” identifies nodes in the top decile of positive normalized betweenness. These relative labels change with the selected conflict and period. They do not establish that the graph follows a power law, arose through preferential attachment, or that a node exercises command or causal control. For graphs above 1,200 nodes, betweenness excludes observation leaves to maintain interactive performance; the interface discloses that scope.

Method reference: Albert-László Barabási, *Network Science*, <https://networksciencebook.com/>

Implementation reference: Graphology standard library, <https://graphology.github.io/standard-library/>

## Public satellite geometry

The optional satellite layer uses a frozen 2026-08-29 subset of CelesTrak's public SAR general-perturbations catalog. The browser propagates those orbital elements around their catalog epoch to draw approximate ground tracks. The layer is a cartographic reference, not a live operational feed, pass alert, or claim about tasking.

The initial relationship is supported by ICEYE's statement that it expanded the Ukrainian Ministry of Defence's access to the ICEYE SAR satellite constellation. That is a constellation-level relationship. It does not establish that every publicly catalogued ICEYE spacecraft supplied imagery to a particular operation. The generated atlas preserves that boundary in `individual_asset_boundary` and keeps the orbit records free of conflict identifiers.

CelesTrak GP formats: <https://celestrak.org/NORAD/documentation/gp-data-formats.php>

ICEYE operator statement: <https://www.iceye.com/newsroom/press-releases/ukraine-expands-partnership-with-iceye>

## What is not inferred

The atlas does not use its contextual health series or other outside data streams to close initiation, intent, territorial gain, economic gain, force strength, equipment, or battlefield questions. User prompts open those questions, and NCM carries the projection through Uppsala and V-Dem observations toward the causal head while retaining every intermediate enclosure.
