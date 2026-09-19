# War Maps Project 0.10.0 — conflict topology and map-data boundaries

This release expands the conflict-specific 3D network, introduces a bounded Civilian Casualties time view, and brings the Gas Map and casualty-map sources into the atlas Information section.

## Conflict-network changes

- Allied nations and actors group on spherical shells around their encoded side while collision buffers keep nations, locations, and observations from occupying the same space.
- Additional locations and states enter only when a conflict-year or event observation inside the selected interval contains them. Named conflict participants remain the starting structure.
- The optimization selector provides equilibrium sphere, coalition shells, prisoner’s-dilemma proxy, interested-third-party, pirates-allocation proxy, and temporal-orbit layouts in both the embedded and standalone 3D interfaces.
- The layouts use the full three-dimensional field and remain targets for the live anchoring and collision forces. They are comparative geometry, not solved games, payoff estimates, or Nash-equilibrium claims.
- Playback preserves the live camera and existing node positions while adding newly reached observations. Side dragging continues to propagate through connected nodes with influence diminishing by graph distance.

## Civilian Casualties

- Inclusive From and Through controls now filter the UCDP civilian-death calculation itself, including map towers, scale, total, country count, ranking, inspector, and tooltips.
- The default is the latest five calendar years, 2022–2026, rather than an all-time accumulation. Rwanda’s 1994 total therefore no longer dominates the present-day map; any actual observations inside the selected range remain visible.
- The unsupported 2025 source year remains blank rather than being interpolated.
- The separately sourced Gaza context towers remain visibly outside UCDP and outside the UCDP total.

## Information and provenance

- A new Map datasets page identifies Gas Map sources for the United States, European Union, Japan, Australia, New Zealand, India, and Taiwan, along with native resolution and displayed fuel grade.
- The same guide documents exchange-rate sources, USD-per-U.S.-gallon conversion, UCDP GED 25.1 and candidate-event boundaries, external Gaza sources, and reference geometry.
- Coverage, citations, navigation, README, generated output, and source notes now point to the new guide.

## Validation

- `python3 -m unittest discover -s tests -q`: 22 tests pass.
- `python3 -m src.generate_web_atlas`: generated output is synchronized.
- Edge/Chromium WebGL smoke checks verified the embedded network, the standalone pirates-allocation topology, the 2022–2026 casualty default, and the new map-source guide.
- `git diff --check`: clean.
