# GraphML and print-view handoff

The 3D Network Browser (`outputs/web/network-3d.html`) provides **Load a graph**
and **Export viewport graph**. Reload older browser tabs to get these controls.
Files are processed locally, not uploaded.

The government-free Russia–Ukraine graph is:
`outputs/print/maps-event-hubs-russia-ukraine-2026.graphml`
(2,788 nodes, 4,561 edges in the current snapshot).

Loading a GraphML file replaces the current graph, retaining all components and
isolated nodes. Layouts rearrange the same edges; clicking nodes does not apply
the native browser's ten-neighbour expansion limit to imported graphs.

Arrange, rotate and zoom, then choose **Export viewport graph**. The downloaded
`.graphml` contains the displayed graph's nodes and edges, attributes, current
world-space `x`, `y`, `z`, and graph-level JSON `viewport` metadata containing
camera position, quaternion, up vector, orbit target, zoom, field of view and
viewport dimensions. It also stores the selected node and layout. Send this
file back as the print-layout handoff. This exports the whole loaded/displayed
graph, not just the nodes falling inside the screen rectangle.

Reloading a viewport export chooses **Saved viewport positions**, fixes those
positions, restores the camera and disables idle rotation. Choosing another
layout releases the saved positions. A different window aspect ratio may crop
the scene differently; the original dimensions remain in the file for print.

Supported: one flat GraphML graph, numeric/string/boolean attributes, defaults,
parallel edges and isolated nodes. Direction flags are preserved, but the
browser's layout treats connectivity as undirected. Nested graphs, hyperedges,
ports, DTDs and entities are rejected. Limits: 40 MB, 15,000 nodes, 60,000 edges.
Imported betweenness is taken from file attributes, not recalculated or assumed
from the layout. Source records remain attributes in exported files.

## Implementation / continuity

- `src/event_feature_network.py`: `export_graphml()` is called by the poster
  generator after its audit is written, so GraphML survives regeneration.
- `web/graphml.js`: validated parser and round-trip serializer.
- `web/network-3d.js`: replace graph, preserve imported components, capture and
  restore positions/camera.
- `web/network-3d.html`: local file input and parser script.
- `src/generate_web_atlas.py`: copies all controls and parser into `outputs/web`.
- Regenerate browser: `python -m src.generate_web_atlas`.

These are persistent repository files; continuation does not depend on chat
context. Changes have not been committed, pushed or deployed by this task.

## Labels and hub filtering

**Show labels** in the top control deck toggles both persistent labels and hover
labels. **Barabási · hub-and-spoke** arranges observed nodes into degree-ranked
hub/neighbour groups; it does not synthesize preferential-attachment edges or
claim that the observed network is scale-free. Selecting it enables **Hide >60%
hub links**. This checkbox can also be used with other layouts.

The threshold is strictly greater than 0.6, using distinct other neighbours
divided by `loaded node count - 1`. Parallel links and self-loops do not inflate
the count. All incident links of qualifying hubs are hidden and exert no spring
or magnetic attraction; the nodes, isolates and source edges remain present.
The control reports how many hubs and links are hidden. This is a single-pass
filter, not recursive pruning. Uncheck it to restore the links.

Viewport exports preserve label visibility, the hub-filter setting and hidden
hub IDs inside the `viewport` metadata, alongside positions and camera settings.
The GraphML still contains all source edges, including those hidden in the view.

## Saved-view poster trial

The user-supplied `war-maps-viewport-barabasi (1).graphml` is preserved at
`data/curated/network-views/russia-ukraine-barabasi.graphml`.
Run `python -m src.generate_viewport_poster` to rebuild the alternate 18 x 24-inch
poster, `outputs/print/maps-event-hubs-russia-ukraine-2026-saved-view.pdf`.
The full print generator also includes it when the saved input exists.
The original poster remains unchanged.

The renderer uses the inverse camera quaternion and perspective projection,
crops nodes behind the camera or outside the exported viewport (approved by the
user), then uniformly fits the remaining projection. It never reruns a graph
layout. The trial draws 2,503 nodes and 4,080 links, cropping 285 nodes and their
incident links. The companion GraphML retains all 2,788 nodes and 4,561 edges.
The JSON audit records the input hash, camera, crop IDs and print coordinates.
This particular input predates visibility metadata, so labels default to on and
hub-link filtering defaults to off; none of its nodes exceeds 60% connectivity.

## Selected overview and hybrid posters

`python -m src.generate_view_comparison_posters` builds two additional vector
18 x 24-inch PDFs in `outputs/print`:

- `maps-event-hubs-russia-ukraine-2026-third-party-3.pdf`: the selected overview.
- `maps-event-hubs-russia-ukraine-2026-lattice-hybrid.pdf`: subdued lattice (14)
  overview above, explanatory text and shape legend between the graphs, and
  lattice (7) as the foreground detail below.

Their three GraphML inputs are preserved in `data/curated/network-views` using
the `russia-ukraine-third-party-3`, `russia-ukraine-lattice-14`, and
`russia-ukraine-lattice-7` stems. Both are included in the full print generator
when all inputs exist. JSON companions preserve input hashes, camera settings,
projection coordinates, cropped IDs, label IDs and full-graph diagnostic counts.
The crop counts are disclosed on each poster. Component-removal diagnostics are
computed on the full graph, not on the visible crop. The originals are retained.

The hybrid now uses matching boxed orientation anchors: A / Drone, B / Pokrovsk
direction, C / Shelling-artillery, D / 2026-08-12. Letters also mark the actual
visible nodes, using their original type glyphs. In lattice (7), B is
outside the saved crop and receives no foreground card. A, C and D provide the
visible cross-panel anchors; D has a bottom-left card and triangle glyph.
Additional dates are prioritized by nearby visible fatal-event density, with
collision-checked labels and leaders to their exact-day nodes. These identify
event records, not named individuals or geographic locations.
A numbered foreground list identifies the
five largest visible place hubs by degree, with leaders to their real square
nodes. Each lists unique adjacent fatal-event records in the full graph and in
the visible crop, not individual deaths. JSON preserves the counted event IDs.
Rebuild only this PDF with `python -m src.generate_view_comparison_posters --hybrid-only`.

## Afterimages / curated artwork

`python -m src.generate_memorial_echoes` builds the separate 18 x 24 inch
`war-maps-memorial-incomplete-echoes.pdf` and JSON audit in `outputs/print`.
One unique white vector square represents each unit of the source `best` death
estimate. Russian-side and Ukrainian-side subsets reuse the same positions,
translated up-left in dark red and down-right in black. Civilians and unknown
or unrecognized-side deaths appear in both echoes, once in white; side does
not establish nationality. Counts must reconcile before rendering. The saved
lattice (14) perspective is widened, and a deterministic separated grid packs
individual death marks around event positions. This is artistic displacement,
not geographic positioning. The audit records every point, category, event
point range, source hash, square size and translation. White is drawn last.
The original Afterimages artwork is not modified by this generator.

`python -m src.generate_network_art` independently rebuilds
`outputs/print/war-maps-afterimages-art-poster.pdf` and its JSON composition audit.
This is an opt-in artwork, deliberately separate from the analytical print run.
It layers the preserved lattice (14), lattice (7), and third-party (3) views,
using camera crops, uniform scaling, artistic rotation and coloured linework.
No new connections are added. The three layers repeat the same graph; they are
not additional events or deaths. Nodes are records/features, not individual people.

The poster credits Sid J. A. Hubbard for visual exploration and saved viewpoints,
and OpenAI Codex for AI-assisted composition/rendering. Data attribution is
separate; data providers are not represented as co-authors or endorsers.
The generator is deterministic from these human-selected inputs, not a claim
that the artistic arrangement can be independently derived from raw event data.

Verification: the actual 2,788-node / 4,561-edge file loaded in Edge, exported
with finite positions for every node and camera metadata, and reloaded in Saved
viewport positions mode with the same node/edge counts and provenance. The 69
existing Python tests and the added GraphML exporter regression test passed.
NetworkX's capitalized True/False booleans caused the first reported import
failure; the reader now accepts either case and the exporter writes lowercase.
