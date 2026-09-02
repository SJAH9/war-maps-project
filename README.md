# The War Maps Project

The War Maps Project is an open, reproducible atlas of organized armed conflict from 1946 to the present. It applies Nested Causal Modelling as a filter for reality: observations, claims, and source accounts remain attached to their enclosures instead of being collapsed into a single authorized narrative or suppressed because they conflict.

The atlas begins with every state-based armed conflict in the UCDP/PRIO Armed Conflict Dataset 26.1 (1946-2025), adds a current-event layer from the UCDP Candidate Events Dataset through July 2026, and nests those conflict-years inside the state conditions observed in V-Dem. The first current focal centre is the Iran-Israel-United States war recorded by UCDP as conflict `16905` in its candidate data.

## First public release

The first public release establishes the reproducible observed field, the interactive world and nation explorers, configurable print volumes, and the ternary enclosure grammar. The project horizon is broader: **to produce navigable nested causal models of every organized conflict for which suitable peer-reviewed datasets are available**. The project identifies every data source, discloses its methods and transformations, and preserves the boundaries of each observation.

The current release is therefore an operational foundation, not a claim that every conflict already has a complete causal model. Each conflict begins at its available source boundary and can deepen through recursively addressed decisions, actors, conditions, claims, economic relations, alternatives, and consequences without erasing uncertainty or source context. See [First Public Release](docs/FIRST_PUBLIC_RELEASE.md).

## Ternary enclosure

The ternary enclosure function is not a three-valued classification system. It records:

```text
E = [ E(outer enclosure) | D(specified departure) | E(inner enclosure) ]
```

The first and third positions are always enclosure functions. The departure has a stable address, repeatable measurements, and join keys. Outer recursion reaches source conditions; inner recursion reaches consequences and the information consumer. The resulting record is a recursively specified causal path rather than a detached correlation. A state statement, academic dataset, user-prompted projection, or propaganda artifact therefore remains at its proper address with its source and method visible.

Revision 1 also maps the war behind the public war. Plausible alternative histories, alleged backchannels, informal and celebrity diplomacy, and unresolved stories remain navigable projection branches. They are not collapsed into the observed chronology, but neither are they excluded for being volatile or incomplete. See `docs/REV1_SPEC.md`.

## Nation exploration

Every mapped nation opens a nation-centred record with three views. **Date** combines a zoomed map with a year timeline and the UCDP/V-Dem observations occupying that nation-year. **All time** centres the nation on a globe and maps governments coded on the same side in slate/olive and opposing state governments in oxblood/clay, with saturation driven by the number of coded conflict-years. **Raw data** exposes the joined conflict-year, country-year, and candidate-event rows and provides a JSON download.

The world map accepts a movable 1, 10, 25, 50, or all-time window. Its government-type selector uses V-Dem's `v2x_regime` vocabulary: Closed Autocracy, Electoral Autocracy, Electoral Democracy, and Liberal Democracy. "Totalitarian dictatorship" is not substituted for an official V-Dem category.

An optional satellite layer plots approximate ground tracks from a frozen CelesTrak public GP snapshot. The initial layer joins the public ICEYE catalog to ICEYE's documented constellation-level imagery support for Ukraine. That relationship does not establish that every catalogued spacecraft participated in a particular operation. Orbit geometry and conflict relationship remain separate records in the generated data.

## Conflict network exploration

The top-level **Network** view starts from any conflict in the shared Select War register. It connects the selected conflict to Side A and Side B, their recorded actors and state participants, conflict locations, and the UCDP conflict-year or candidate-event observations joined to each location. The network floats above a muted, blurred map of the selected conflict locale. Its 3D scene uses persistent semantic-node labels and slowly rotates on first draw, pauses on interaction, and resumes after eight idle seconds. Nodes can be dragged to fixed positions, searched, emphasized by class, and clicked to highlight their immediate connections without detaching an observation from its source identifiers or coding fields. Browsers that cannot paint the WebGL scene reliably receive a projected SVG 3D view with the same labels, idle rotation, drag, zoom, selection, and filtering behavior. A two-dimensional renderer remains the final compatibility path.

The top-level **Life and Death** view floats Natural Earth country geometry above a thin golden isotropic-vector-matrix lattice and places independently toggled stacks at each state: UCDP candidate-event fatalities, IHME GBD 2023 age-standardized all-cause mortality, and a period total fertility rate derived from IHME age-specific fertility rates. Conflict is encoded from black to red, mortality in navy blue, and fertility in deep violet. A single fixed phi-accelerated block form keeps low observations near the map while separating the upper tail: block frequency follows a phi-power response and block height rises from 1 scene unit to φ at the eighteenth level. The southeast Atlantic compass rose uses a Metatron's-cube construction. Each metric remains independently normalized because fatalities are counts while mortality and fertility are rates; actual values and units remain in the inspector. Conflict dates and the 1980-2023 health year are controlled separately so the interface does not imply that the current 2026 event layer is contemporaneous with the latest 2023 health estimates.

The network opens at the conflict's earliest recorded date. A closed conflict ends at its generated episode end date; a conflict active at the loaded source boundary extends to the present while separately disclosing the latest observed source date. The visible date controls can narrow that automatically established temporal enclosure.

## Information and population-health layers

The web atlas includes dedicated pages for [project background](web/about.html), [map formulation](web/method.html), [conflict data](web/data-conflict.html), [governance data](web/data-governance.html), [population-health data](web/data-health.html), [coverage limits](web/coverage.html), [citations](web/sources.html), and the shared [color legend](web/color-legend.html).

The main world explorer can place IHME all-cause mortality or fertility beneath conflict events for any observed health year from 1980 through 2023. V-Dem regime categories and category transitions can be inspected on the same field. The related-data panel reports descriptive regime-group means and adjacent-year observations around transitions; it does not present these associations as causal estimates. No health data are invented before 1980 or carried beyond 2023.

## Build

Python 3.10 or newer builds the data and web atlas. Print generation additionally uses `fpdf2`.

```bash
python3 -m src.build_atlas
python3 -m src.generate_life_death_metrics \
  --mortality /path/to/IHME-GBD_2023_all_cause.zip \
  --fertility /path/to/IHME-GBD_2023_fertility.zip
python3 -m src.generate_web_atlas
python3 -m src.generate_print_atlas --conflict ucdp-candidate-16905 --size standard
python3 -m unittest discover -s tests
```

Open `outputs/web/index.html` directly, or serve the repository root:

```bash
python3 -m http.server 8765
```

## Data boundaries

- UCDP/PRIO 26.1 supplies the canonical 1946-2025 state-based conflict-year spine.
- UCDP Candidate Events supplies 11,867 unique provisional observations through July 2026. All 485 candidate conflict clusters are navigable; overlapping monthly rows replace their earlier quarterly form by stable event ID. Candidate coding is explicitly not treated as final.
- A conflict-year row is not a complete event chronology. It establishes annual participation, incompatibility, type, and intensity under UCDP definitions.
- Uppsala and V-Dem are the project data field. The project does not create a generic intake layer for outside datasets.
- Natural Earth and CelesTrak supply cartographic reference geometry only. ICEYE's operator statement supplies the separately enclosed constellation relationship; it is not treated as conflict-event data or individual satellite tasking.
- User prompts select the volatile question. NCM then projects from outer conditions inward to expose initiation, motive, decision makers, war economies, trade relations, equipment, claims, and other causal flows at the depth the nesting reaches.
- A projection is not cut off merely because the first dataset row does not contain the answer. The atlas keeps asking the next correctly nested question and documents the resulting causal path.

## Print volumes

Print volumes configure themselves to the available depth:

- `brief`: a small field map, chronology, parties, and open frontier;
- `standard`: adds the war-economy field, recursive causal flow, and prompted projection branches; and
- `archive`: retains the full available chronology and recursive evidence record.

The format does not enforce both-sideism, one-sideism, or no-sideism. It follows the enclosed causal structure, even when the resulting depth and findings are asymmetric.

## Attribution and license

Project code and original presentation are MIT licensed. UCDP data is CC BY 4.0 and must retain its own attribution. See `docs/SOURCES.md` and `data/SOURCES.json`.

The project is produced by the RTLDI Atlas Project and Sid J.A. Hubbard, with AI and data-science tools used in research and engineering. The project takes the side of accurately enclosed evidence and human life; it does not participate in prosecution of war for any belligerent.
