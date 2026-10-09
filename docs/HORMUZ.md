# Hormuz shipping view

`outputs/web/hormuz.html` uses the Living Conditions Three.js scene grammar: floating flat geographic map, perspective camera, drag-to-orbit and scroll-to-zoom controls, hemisphere/directional lighting, solid pre-dawn star field and gold IVM lattice. Natural Earth 1:10m country polygons are clipped to 52–61°E, 22–30°N by `python3 -m src.generate_hormuz_geometry`. Land is raised visually; marker sizes are not vessel dimensions. A static isometric canvas remains the fallback if WebGL or its libraries cannot start. Reset 3D view restores the initial camera. Data changes do not reset the reader's camera.

The browser requests public hormuz.now endpoints: compact snapshot every 20 seconds, status and daily series every five minutes, counting-gate GeoJSON on load, and a selected vessel's sampled track on selection. Requests stop refreshing while the tab is hidden. There is no paid API dependency or server-side archive.

Snapshots supply report age rather than original report timestamps. Their estimated time is explicitly approximate. Selected-vessel detail may supply `posAt`, displayed as a provider timestamp. Tracks connect observed samples without extrapolating ship movement. These are AIS-reported coordinates, not independently established exact locations. The counting gate is the provider's gate, not an inferred legal boundary. Cached positions remain visibly dated after refresh failure.

Daily AIS crossing totals and IMF PortWatch figures are separate series. Daily resolution does not guarantee daily publication. Partial latest days and coverage gaps should not be interpreted as complete traffic. Source attribution and limitations appear beside the view. Natural Earth geometry is public domain; hormuz.now data is CC BY 4.0; IMF-derived series retains IMF provenance.

Build: `python3 -m src.generate_web_atlas`. Entry card is on the War Maps landing page. Existing maps and their data are unchanged.
