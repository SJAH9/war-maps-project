# War Maps Project v0.7.0

## Population and network science

This release adds total population to the Life and Death field and introduces a transparent network-science layer for every conflict graph.

### Life and Death

- Adds World Bank WDI indicator `SP.POP.TOTL`, primarily sourced from UN World Population Prospects, covering 1960-2025.
- Displays population as an independently normalized golden stack and reports native counts in people.
- Keeps population, conflict fatalities, mortality, total fertility, and crude birth rate separate in controls, units, colors, rankings, and disclosures.
- Corrects the shared World Bank metadata filter so regional and global aggregates are excluded from both demographic payloads.

### Conflict network

- Applies the analytical vocabulary of Albert-László Barabási's *Network Science* to each selected UCDP-derived conflict graph and date window.
- Computes unique-neighbor degree, normalized degree centrality, normalized betweenness, connected components, density, and observed degree distribution with Graphology.
- Scales nodes sublinearly by degree and exposes relative hub and bottleneck roles in the node inspector.
- Defines hubs and bottlenecks as within-view decile roles, not permanent labels or evidence of command, motive, influence, causation, preferential attachment, or a scale-free distribution.
- Uses structural-node betweenness for graphs above 1,200 nodes while retaining all observation leaves in the display.
- Strengthens relationship contrast and improves renderer health detection so partially painted WebGL scenes fall back to the rotatable, draggable SVG 3D view with visible links and node shapes.

## Direct links

- [Explore the conflict network](https://sjah9.github.io/war-maps-project/outputs/web/network.html)
- [Open Life and Death](https://sjah9.github.io/war-maps-project/outputs/web/life-death.html)
- [Read the method](https://sjah9.github.io/war-maps-project/outputs/web/method.html)
- [Review source citations](https://sjah9.github.io/war-maps-project/outputs/web/sources.html)
- [Browse the source code and data](https://github.com/SJAH9/war-maps-project)
