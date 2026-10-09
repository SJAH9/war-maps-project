# Hormuz shipping view

`outputs/web/hormuz.html` uses the Living Conditions Three.js scene grammar: floating flat geographic map, perspective camera, drag-to-orbit and scroll-to-zoom controls, hemisphere/directional lighting, solid pre-dawn star field and gold IVM lattice. Natural Earth 1:10m country polygons are clipped to 52–61°E, 22–30°N by `python3 -m src.generate_hormuz_geometry`. Land is raised visually; marker sizes are not vessel dimensions. A static isometric canvas remains the fallback if WebGL or its libraries cannot start. Reset 3D view restores the initial camera. Data changes do not reset the reader's camera.

The browser requests public hormuz.now endpoints: compact snapshot every 20 seconds, status and daily series every five minutes, counting-gate GeoJSON on load, and a selected vessel's sampled track on selection. Requests stop refreshing while the tab is hidden. There is no paid API dependency or server-side archive.

Snapshots supply report age rather than original report timestamps. Their estimated time is explicitly approximate. Selected-vessel detail may supply `posAt`, displayed as a provider timestamp. Tracks connect observed samples without extrapolating ship movement. These are AIS-reported coordinates, not independently established exact locations. The counting gate is the provider's gate, not an inferred legal boundary. Cached positions remain visibly dated after refresh failure.

Daily AIS crossing totals and IMF PortWatch figures are separate series. Daily resolution does not guarantee daily publication. Partial latest days and coverage gaps should not be interpreted as complete traffic. Source attribution and limitations appear beside the view. Natural Earth geometry is public domain; hormuz.now data is CC BY 4.0; IMF-derived series retains IMF provenance.

Build: `python3 -m src.generate_web_atlas`. Entry card is on the War Maps landing page. Existing maps and their data are unchanged.

## Land elevations

Mapzen Terrain Tiles on AWS supplies regional DEM data, sampled from zoom-7 Terrarium tiles to a 0.05° grid. `python3 -m src.generate_hormuz_terrain` records tile URLs, hashes, retrieval time, and actual heights in metres. Terrarium decoding follows the provider's documented RGB formula. Land triangles are subdivided and bilinearly sampled from this grid; the detailed Natural Earth coastline remains the geographic clipping boundary. Negative elevations are clamped to the sea-level reference for this land-only display. No bathymetry is displayed. Heights are exaggerated 20× relative to the regional latitude-distance scale, prominently labelled and switchable; elevations are not live measurements or navigational data.

Attribution: Mapzen Terrain Tiles; SRTM and GMTED2010 data courtesy of the U.S. Geological Survey; global ETOPO1 terrain data courtesy of NOAA. [Complete provider attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

## Seabed and vessel blocks

The same signed DEM now supplies seabed depths below the regional sea-level plane; a translucent water surface exposes the relief. Land and seabed share the labelled 20× vertical exaggeration. Bathymetry is a coarse reference, not a current survey or navigational chart. This supersedes the land-only display described above.

Each ship is a constant-size block with its bottom at sea level. Overlapping horizontal marker footprints are assigned successively higher levels in provider-ID order, retaining their reported horizontal coordinates. Stack height encodes visual separation only, not ship altitude or dimensions. Blocks use reported flag-state colours, with a below-map legend of currently visible flag counts. Unknown flags remain grey; flag state is not ownership or crew nationality.

## Yemen and Bab el-Mandeb extension

The continuous geographic window is 40–61° E, 10–30° N. It includes Yemen,
Bab el-Mandeb, the southern Red Sea and Gulf of Aden. Natural Earth 1:10m
coastlines and zoom-7 Mapzen terrain retain the same 0.05° sampling and 20×
vertical exaggeration as the Hormuz map. Focus controls move the camera;
they do not change data resolution. Land and seabed are reference terrain,
not navigation charts. Vessel positions and daily crossing counts remain
Hormuz-only. No Bab el-Mandeb live vessel coverage is claimed.
