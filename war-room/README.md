# War Room

War Room is a separate, desktop-oriented presentation of [The War Maps Project](https://github.com/SJAH9/war-maps-project): a perspective map table, three independent NewsBoob players, and physical-style control palettes.

[Open War Room](https://sjah9.github.io/war-maps-project/outputs/war-room/).

## Views and controls

World map, Human cost, Living conditions and Fuel prices share the native Plotly Natural Earth projection. Hormuz and Bab el-Mandeb retain native Three.js terrain. The opening World view frames Ukraine and Saudi Arabia with Orbit enabled where the entire turn keeps map edges outside the viewport. Reduced motion leaves Orbit off. Place search moves and zooms to existing atlas locations.

Map controls and NewsBoob remotes are draggable. Click a casing to bring it to the foreground; use its top bar to return it to the side. The slim Wars palette starts in the foreground. Clicking elsewhere or choosing a nation returns it left. A nation button loads its conflict and moves the map without scrolling off the table. Fly to place and the native Global organized violence Place/Count controls occupy the table front.

The five Wars buttons rank named conflict IDs by recorded event counts in the selected year range, independent of display filters. Tooltips disclose the conflict, count and observation dates. This is a ranking of loaded records with incomplete coverage, not a live or comprehensive measure of global war size. Placeholder-only XXX conflict titles are excluded. Current candidate coverage is through September 2026; casualty rollups marked ineligible are not used for this ranking.

The three NewsBoob screens retain independent station, power, mute and volume controls. A deliberate hover can focus audio; browser autoplay policy and broadcaster availability still apply. Broadcasts remain separate from verified source records. Satellite paths and estimated separation retain native defaults; frozen orbit models are not live observations. Bab el-Mandeb has terrain reference only; vessel coverage is limited to Hormuz.

## Build

From the repository root, with the existing project dependencies installed:

```sh
python3 -m src.generate_war_room
python3 -m unittest tests.test_war_room_adapters
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/outputs/war-room/`. Keep generated `outputs/war-room/` beside `outputs/web/`; the derivative resolves native assets there. The build backs up changed outputs locally and checks source hashes before writing. It does not regenerate source datasets or change the main atlas.

## Native contracts

`src/generate_war_room.py` and `src/war_room_adapters.py` adapt named rendering seams and fail if those contracts disappear. Native aggregation, filtering, inspectors, data sources and calculations are retained. `outputs/war-room/provenance.json` records input and output hashes. Public dependencies remain Plotly 3.1.0, satellite.js 6.0.1, Three.js 0.128/OrbitControls and the maintained native NewsBoob/HLS player. Network access is required for those dependencies, live feeds and external evidence.

No AuthorOS administration, private project data, credentials or local LAN helper is included. War Room does not create new content scores or observations. Existing project and upstream attribution/license terms apply.

## Controller interaction update

Map Controls, Top Five Wars and NewsBoob Remote dock as name-only title tabs on
the table front. Tap to open, drag freely and tap the title to dock. Reopening
restores the last floating position; outside clicks and nation selections do
not move palettes. Place/count and table tools are inside Map Controls, so the
dock adds no front-panel height. Nation selection now leaves the map still;
Orbit remains available manually. The memorial opens only from its band, and
Conflict Sides uses thin white outlines on both named-side dot colors.
