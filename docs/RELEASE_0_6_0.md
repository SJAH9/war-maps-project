# War Maps v0.6.0: documented fields and a unified visual system

This release makes War Maps easier to understand, audit, and compare. It adds a complete web information section, carries one semantic palette through every mapping surface, places geographic context behind conflict networks, and joins population-health observations to the primary world explorer without obscuring source boundaries.

## Information architecture

- Adds an information hub and dedicated About, method, conflict-data, governance-data, population-health, coverage, citation, and color-legend pages.
- Gives every page the same primary navigation and every documentation page a persistent secondary navigation.
- Documents project origins, Principal Investigator, AI/data-science production disclosure, MIT software license, upstream rights, project citation, and repository links.
- Separates UCDP conflict observations, V-Dem governance categories, IHME health estimates, and Natural Earth geometry by unit, date, role, and license.
- Explains the normalization, name joins, source-row preservation, missing-value policy, prompted projection boundary, and non-adjudicative use of geometry.

## Shared visual language

- Replaces the earlier mixed teal, violet, and cool-blue map treatments with a militarized autumn system built from slate, clay, terra cotta, manila, olive, olive drab, and khaki.
- Reserves orange for selection, primary red for candidate conflict events, yellow for focus boundaries, and neon green for regime transitions.
- Uses slate/olive consistently for Side A and same-side relationships, and oxblood/clay for Side B and opposing relationships.
- Preserves distinct slate-navy mortality and aubergine fertility families without introducing a red-white-blue combination.
- Adds a formal color-legend page that states what each color means and, equally importantly, what it does not mean.

## World explorer

- Adds all-cause mortality and fertility choropleths directly to the primary conflict map.
- Keeps the conflict window and IHME health year independent so observations with different temporal boundaries are not presented as contemporaneous.
- Overlays 2026 candidate conflict events on health fields when the selected conflict window supports them.
- Supports V-Dem regime-category outlines and visible regime-transition markers on the same map.
- Adds descriptive mortality and fertility means for each V-Dem Regimes of the World category and an adjacent-year transition inspection list.
- Uses V-Dem's actual `Closed Autocracy`, `Electoral Autocracy`, `Electoral Democracy`, and `Liberal Democracy` vocabulary. It does not silently substitute a `totalitarian dictatorship` category that the loaded four-class field does not measure.
- Does not extrapolate health observations outside IHME's loaded 1980-2023 coverage or conflict observations before UCDP's 1946 boundary.

## Conflict network and other maps

- Places the interactive network over a muted, blurred geographic map fitted to the selected war's recorded locations.
- Makes the WebGL scene transparent so the locale remains legible while labels and selected connections retain priority.
- Carries the shared side, actor, nation, location, observation, and selection colors into the 3D, SVG, and 2D network renderers.
- Updates nation date maps, all-time relationship globes, candidate-event markers, ocean treatments, and Life and Death geometry to the same palette.

## Reproducibility

- Extends the web generator to deploy every static HTML information page automatically.
- Adds regression tests for the information architecture, health/governance controls, source-valid health range, semantic side colors, and network locale map.
- Regenerates `outputs/web` from the source build.
- Passes all 15 automated tests.

## Data boundaries

The release adds no synthetic conflict, mortality, fertility, or regime observations. UCDP annual conflict coverage begins in 1946, candidate events extend through July 2026, and loaded IHME mortality and fertility cover 1980-2023. Group comparisons are descriptive associations, not causal estimates. Upstream observations remain attributable to UCDP, V-Dem, IHME, and Natural Earth; War Maps transformations and presentation are attributable to the War Maps Project.
