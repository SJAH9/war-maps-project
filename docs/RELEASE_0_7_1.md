# War Maps Project v0.7.1

## In-scene global metric rail

This release adds a four-row typographic information rail to the Life and Death visualization.

- Places Population, Fertility, Conflict, and Mortality labels directly in the Three.js scene north of the map.
- Uses large color-matched block lettering, dotted leaders, and right-aligned values on the same plane as the country stacks.
- Reports exact World Bank `WLD` population, selected UCDP fatality totals, and explicitly labelled displayed-country means for mortality and fertility rates.
- Updates the rail whenever the measure year, conflict range, or fatality estimate changes.
- Constrains azimuth, polar rotation, zoom, and panning so the rail cannot be inverted or rotated behind the map.
- Documents the aggregation boundary and adds build assertions for the scene geometry and camera constraints.

## Direct links

- [Open Life and Death](https://sjah9.github.io/war-maps-project/outputs/web/life-death.html)
- [Read the population-health method](https://sjah9.github.io/war-maps-project/outputs/web/data-health.html)
- [Browse the source code and data](https://github.com/SJAH9/war-maps-project)
