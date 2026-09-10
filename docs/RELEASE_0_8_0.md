# War Maps Project v0.8.0

## Candidate-data integrity and inspectable GraphML

This release closes data-quality problems exposed by the new conflict-network GraphML downloads. Moving network records out of embedded JSON and into typed, first-class GraphML fields made the temporal, geographic, scope, and fatality assumptions directly testable downstream.

### Fixed

- Revalidated fresh official UCDP January-June and July 2026 Candidate downloads. The files match the committed snapshots byte for byte; July 2026 remains UCDP's latest listed candidate release as of 9 September 2026.
- Stops summing candidate fatality estimates into location, nation, conflict, print, and Life and Death totals. Candidate records can overlap and the source schema does not classify incident, aggregate, or correction rows.
- Preserves each source fatality range on its observation, marks its invariant status, and withholds invalid or `Check deaths` estimates from GraphML measure fields and node sizing.
- Separates `temporal_end` (latest included observation) from `display_end` and `export_date`, with a visible stale-source warning.
- Adds explicit graph scope, included conflict, dyad IDs, and non-aggregation policy to every GraphML download.
- Withholds precision 5-6 and `Check geography` observations from point maps while preserving their source coordinates.
- Adds maritime network locations derived from source descriptions, preventing offshore observations from becoming terrestrial theater totals.
- Normalizes `Straight of Hormuz` to `Strait of Hormuz` for display and joins while retaining the original source place.
- Cleans source-headline control debris for display while preserving the raw source field in canonical data.
- Exposes typed civilian, side, location-kind, map-eligibility, record-class, perpetrator, attribution, and child-data availability fields. Unsupported values are explicitly unknown rather than inferred.
- Regenerates the web atlas and current-conflict print products with these boundaries.

### Use the exports

Open the [Conflict Network](https://sjah9.github.io/war-maps-project/outputs/web/) and choose **View network data**, then **Download GraphML**. The resulting `.graphml` file opens directly in GraphML-aware tools and carries degree, degree centrality, betweenness, coordinates, source attributes, quality flags, scope, and dates as typed fields.

The release does not replace UCDP records with press estimates or project research. Source defects and provisional statuses remain visible; the atlas changes how uncertain records are mapped and aggregated.
