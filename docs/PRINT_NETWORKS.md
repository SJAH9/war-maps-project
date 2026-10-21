# Conflict networks and the War Ephemeris

These are **print-only** publications. No web page, navigation item, or browser
equivalent is added.

The initial build evaluates 1,886 conflict/type identities and includes 539
networks active in 2026. The ranked five are Afghanistan: Government,
IS - Civilians, Russia - Ukraine, Iraq: Government, and Syria: Government.
Counts and ranking are recomputed, not hardcoded, on subsequent builds.

## Build

```sh
python3 -m pip install -r requirements.txt
python3 -m src.generate_network_print
```

The generator requires the local reviewed GED archive
`data/raw/ged261-csv.zip`. It fails explicitly if that archive is missing; it
does not silently replace full history with a current-year-only graph.
`--networks-only` builds the four graph PDFs, three mortality posters and machine registers without the
long Ephemeris. `python3 -m src.generate_war_ephemeris` rebuilds the Ephemeris
from the existing print register and current local data.

Outputs in `outputs/print/`:

* `war-maps-conflict-networks-top-10-mortality.pdf`: ten 1296 x 1728 pt (18 x 24 inch)
  vector posters, with graph, degree distribution, chronology, legends,
  interpretation, attribution and cuboctahedral vector-equilibrium compass.
* `war-maps-event-networks-2026.pdf` and `war-maps-event-networks-all-time.pdf`:
  one 18 x 24 inch poster each, with every available event as a node, including
  candidates. Their `.json.gz` companions preserve every incidence endpoint.
* `war-maps-mortality-2024.pdf`, `war-maps-mortality-2025.pdf` and
  `war-maps-mortality-2026.pdf`: matching 18 x 24 inch posters with one filled
  vector dot per reported death. Civilian deaths are red, coded-side
  deaths blue, unknown status grey-brown. Its JSON companion records counts,
  source releases and included event IDs.
* `war-maps-conflict-networks-2026.pdf`: one 612 x 792 pt (US Letter) page per
  conflict/type identity with a recorded event interval overlapping 2026.
* `war-ephemeris.pdf`: US Letter, 7.25 pt minimum table body, complete static
  data tables, source catalogue, bookmarks, page index and embedded recovery ZIP.
* `conflict-network-register.json`: exact drawn node/edge lists, yearly
  weights, evidence IDs, metrics and a ranking audit for every GED conflict.
* `war-ephemeris-recovery.zip`: identical to the ZIP attached inside the PDF.
* `war-ephemeris-index.json`: table counts, section pages and capsule hash.

## Network construction

The primary key is `(type_of_violence, conflict_new_id)`. The type is retained
because the loaded candidate sources contain conflict identifiers used with
multiple violence types. This can produce more print networks than the site's
conflict-ID-only candidate grouping. No name-based conflict merging occurs.
Annual ACD records join only type-1 events with the same stable conflict ID.

Reviewed GED 26.1 covers 1989–2025; the loaded candidate releases cover
January–August 2026. Annual ACD supplies older state-based records from 1946.
The latest candidate revision wins for a repeated event ID, including any
overlap with reviewed GED. These are all **available recorded years**, not a
claim of exhaustive observation of a conflict's lifetime.

Nodes are exact coded actor names and country/first-level-subdivision
geographic theatres. A civilian category is visibly distinguished from an
organization and scoped by country, rather than merged into one worldwide
civilian actor. Missing subdivisions remain explicit. Renamed actors can appear
separately; group-coded annual actors are not split into invented dyads.

Each event adds actor/theatre incidence and a coded-side relationship.
Annual records add coded sides and separately counted secondary participation.
Undirected edges preserve the counts, years and source IDs for every relation
kind. They do not imply attack direction, command or causal influence.
Annual-only links are dashed. Every node and edge is drawn; node labels are
selective and keyed to a register. The PDF is a geographic aggregation, not an
event-node hairball. Exact underlying event IDs remain in the recovery archive.

Network science follows Barabási's *Network Science*, particularly chapters
[2](https://networksciencebook.com/chapter/2) and
[4](https://networksciencebook.com/chapter/4): degree structure, hubs and
components. Betweenness uses normalized unweighted shortest paths; above 128
nodes it is estimated from 128 seeded source nodes. Articulation nodes describe
removal in the encoded graph only. No scale-free fit, preferential-attachment
claim or synthetic Barabási–Albert edges are inserted.

The deterministic spring layout uses sorted node/edge insertion, seed 2026,
100 iterations and no event-count attraction. Visual link width encodes
logarithmic evidence counts; node size encodes degree. Typography uses an
available Unicode font with a ReportLab fallback; exact font appearance may
vary between machines.

## Top-five selection

The original top-five quality-ranked PDF is retained as a previous output,
not overwritten. The current ranked publication is **top ten by mortality**:
sum UCDP `best` deaths over all deduplicated event years per conflict/type.
There is no quality threshold for this mortality ranking; missing estimates
are counted separately and annual totals are not added to event totals.
Candidate observations are provisional; distinct IDs can still contain
overlapping reports. Sums are not verified unique-person death tolls.
The register retains the original quality ranking for continuity and adds
`top_ten_mortality` and `mortality_ranking`.
Use `python3 -m src.generate_network_print --ranked-only` to rebuild just
the ranked ten and register. The original quality-selection method follows.

Posters are ranked across **all locally recorded GED conflicts**, not just
conflicts active in 2026. Eligibility requires ten events, eight nodes and ten
edges. The score is:

```
complete_event_fraction * ln(1 + events) * ln(1 + nodes)
```

A complete event has both actor fields, country, subdivision, start date and
at least one source headline/article/original citation. This is a disclosed
field-completeness proxy, not a guarantee of unbiased reporting. Ties use the
conflict/type key. The ranking audit retains ineligible conflicts too.

## Ephemeris scope and recovery

### Complete event posters

`python3 -m src.generate_event_network_print` rebuilds the two combined posters
independently. 2026 membership is date-interval overlap. All-time includes every
deduplicated event from the local reviewed archive and candidate inputs
(currently 431,627 events; 13,659 overlap 2026). It does not manufacture
event observations from annual-only records.

Each conflict has a black hub, exact named sides (olive triangles), recorded
event countries (teal squares), and every event (red if `best > 0`, grey if
zero/unknown). Each event links to the hub, its sides and its country.
Side/country identity is scoped to the conflict, with no inferred citizenship
or global name merging. Country strings are preserved as coded.
Deterministic balanced spatial partitioning uses `sqrt(event_count) + 3`
weights; chronological phyllotactic positioning distributes events inside
each region. Neither placement nor distance implies geography, causality
or a spring-layout centrality score. No node or edge is sampled away.
Individual events in dense regions are not distinguishable at physical poster
scale; use digital zoom and the exact compressed JSON registers.

The existing Ephemeris PDF/recovery archive is a prior snapshot. A full
generator run refreshes it with the updated source; the focused commands
above intentionally do not regenerate the long Ephemeris.

### Mortality pictogram

`python3 -m src.generate_mortality_poster` rebuilds all three posters and their
audit JSONs. The grid scale uses the largest annual sum across the set; all
three use the same dot size and spacing, leaving unused space intentional.
It sums `best` in revision-reconciled records for each year, requires
`best == deaths_a + deaths_b + deaths_civilians + deaths_unknown` for every
row, and refuses missing/negative values, duplicate IDs or cross-year
intervals that cannot be wholly assigned to one year. There is no rounding,
sampling or inferred allocation of unknown status.

The 2026 January-August releases contain 125,245 reported deaths,
including 21,000 civilians, 74,664 coded-side deaths and 29,581 unknown.
Some uncertain event intervals in the August release extend to September 10;
the poster discloses this and does not claim a strict August 31 cutoff.
Reviewed 2024: 188,209 deaths, 34,895 civilian. Reviewed 2025: 245,464 deaths,
91,566 civilian. Those are full calendar years; 2026 is provisional and
partial-year, so raw totals are not directly comparable annual rates.
"Warfighter" is explicitly a shorthand for coded-side deaths, not an
independent classification of individuals. Each death appears once in the
dot field; the civilian headline is a subset, not a second pictogram.
The poster reports fatal casualties only, not injuries. Provisional
candidate observations may overlap across distinct IDs: this sum is not a
verified unique-person death toll or a full-year total.
Definitions: [UCDP candidate codebook](https://ucdp.uu.se/downloads/candidateged/ucdp-candidate-codebook1.4.pdf).

Every value in the core atlas, auxiliary `*data.js` files, static JSON assets,
curated inputs and the print register is printed without numeric rounding.
Conventional conflict, event and V-Dem indicator tables precede the complete
record appendix. The world GeoJSON is included as well as the terrain raster.
Nested fields use exact JSON notation in a two-column record/path table.
Null remains distinct from zero. Oversized records continue across pages.
All original machine files are also included, avoiding reliance on OCR.

The attached capsule includes a SHA-256 manifest, local raw/curated inputs,
source generators, tests, documentation, website templates and the entire
generated static website. Credentials, hidden files, `.git`, virtual
environments, caches and recursively generated PDFs are excluded.
Extract into a fresh directory, then run:

```sh
python3 src/restore_ephemeris.py --verify .
python3 -m src.generate_web_atlas
python3 -m http.server 8000 --directory outputs/web
```

The static website can be recovered without upstream data services.
Print regeneration requires Python packages from `requirements.txt`; package
binaries are not bundled. Derived health arrays are archived even where the
original licensed upstream export is not locally present.

External live Hormuz AIS endpoints and HLS broadcasts are not finite static
datasets. Their code and endpoint configuration survive, but future vessel
positions and video bytes do not. Offline recovery does not promise to
recreate external services. The Ephemeris says so explicitly.

CDN-hosted browser libraries are not vendored: restoring generated files does
not guarantee that every interactive renderer runs on a disconnected machine.
Superseded GED 25.1 is excluded from the capsule; the current GED 26.1 is kept.

Run `python3 -m src.verify_network_print` to check page counts, dimensions,
attachment hashes and a byte-for-byte static-site rebuild in an isolated
temporary directory without fetching upstream data.

## War Networks report and injuries

Two additional 18 x 24 inch hub posters are built by
`python -m src.generate_event_hubs` (also included in the full print build):
`maps-event-hubs-russia-ukraine-2026.pdf` and
`maps-event-hubs-palestine-southern-lebanon-2026.pdf`.
They use stable conflict IDs from original ranks 01 and 03+04. Records from
original ranks 02/05 are admitted only if an exact non-civilian coded side is
shared; none currently qualify. Side, place and location/date-interval nodes
show degree, normalized degree centrality and exact all-source betweenness.
Source date/location precision is part of interval identity. Every selected
event survives in the companion gzip JSON. Headline method indicators use
explicit keyword matches, not a confirmed weapon taxonomy; missing matches
are not evidence that a method was absent. Structural centrality is not a
claim about command authority or causal influence.

The Russia-Ukraine poster now uses a government-free event/feature view.
Government sides select/provenance the observations but are not visible nodes.
Every event is retained, including isolates. Repeated places, precise single
dates (`date_prec=1`) and explicit headline method terms create feature nodes;
no missing-value or singleton-feature hubs are created. Binary event frequency
is weighted by `IGF=ln(N/df)`, with shortest-path distance `1/IGF` for exact
weighted betweenness. Features occurring in more than 70% of events are
suppressed; nodes connected to more than 70% of remaining nodes are unlinked
until stable. The audit records suppressed features and all underlying events.
Components are laid out separately; shapes, colors and dashed method links
appear pictorially in the legend. Rebuild only this poster with
`python -m src.generate_event_hubs --russia-only`.

The additional `maps-5-large-event-networks-2026.pdf` is an 18 x 24 inch
poster expanding networks numbered 1-5 in the complete 2026 event poster.
It preserves their event-count ranking and every selected event, side and
country endpoint, with fatal events red. The five panels fill the field;
elliptical spiral positions are layout only, not geography or causal links.
Its companion `.json.gz` stores the exact selected records. The normal print
build includes it; to rebuild only this poster, run
`python -m src.generate_event_network_print --large-five-only`.

`python -m src.generate_war_networks` rebuilds the Letter-size
`outputs/print/war-networks.pdf` and its companion graph/audit JSON offline.
The full print generator also invokes this report. It compares observed
country-network structures, retains every loaded US-Iran-Israel conflict
record, and tests chronology links at several time windows. Timing-compatible
links are derived relationships, not confirmation of retaliatory intent.
Statements are separately attributed; undisclosed motives never exclude events.

The public oPt Health Cluster dashboard capture includes 2,069 health-attack
records with separate death and injury attributes, location edges, and 1,099
dated cumulative-report rows. `python -m src.import_health_dashboard` rebuilds
these data offline; add `--refresh` to retrieve the allowlisted public tables.
The machine-readable graph is in `outputs/web/opt-health-dashboard.json` and
the report audit. Cumulative totals, individual attack losses and UCDP deaths
must not be added together: they may overlap. Missing measurements stay null.
No staff, contact or patient tables are imported. Previously generated
Ephemeris PDFs remain snapshots until the full print build is rerun.
