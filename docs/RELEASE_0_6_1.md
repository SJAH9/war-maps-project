# War Maps v0.6.1: network rendering and direct atlas links

## Open the deployed atlas

- [War Maps world explorer](https://sjah9.github.io/war-maps-project/)
- [Interactive conflict network](https://sjah9.github.io/war-maps-project/outputs/web/network.html)
- [Life and Death visualization](https://sjah9.github.io/war-maps-project/outputs/web/life-death.html)
- [Project information and methods](https://sjah9.github.io/war-maps-project/outputs/web/information.html)
- [About the War Maps Project](https://sjah9.github.io/war-maps-project/outputs/web/about.html)

## Network correction

This patch restores the complete relationship field and makes every node class identifiable in all supported renderers.

- Increases base edge visibility and gives structural, event, observation, and selected links distinct semantic colors and weights.
- Encodes Side A structure in slate, Side B structure in oxblood and clay, candidate-event links in primary red, and selected connections in bright yellow.
- Adds distinct 3D geometry for conflicts, sides, nations, actors, locations, and observations.
- Adds the same shape system to the rotatable SVG compatibility renderer instead of reducing every type to a circle.
- Completes the persistent legend with the previously omitted Conflict and Actor classes.
- Reduces the locale-map backdrop opacity so geography remains context rather than obscuring graph edges.
- Preserves node dragging, click-to-highlight behavior, idle rotation, search, class emphasis, and the two-dimensional compatibility path.

## Deployment and verification

- Regenerates the complete `outputs/web` static atlas used by GitHub Pages.
- Adds canonical deployed-page links to the repository README.
- Updates regression coverage for semantic links, custom node geometry, and the complete node legend.
- Passes all 15 automated tests.
- Verifies the corrected network visually in Safari using the SVG compatibility renderer.
