# War Maps 0.14.0 — War Room

War Room adds an immersive, desktop-oriented edition of the War Maps atlas beside the existing website. A perspective map table sits beneath three independent NewsBoob screens, with draggable controls that enlarge when brought into the foreground.

Open War Room: https://sjah9.github.io/war-maps-project/outputs/war-room/

## Included

- Six native displays: World map, Human cost, Living conditions, Fuel prices, Hormuz and Bab el-Mandeb.
- A Ukraine–Saudi Arabia opening view with region-centered Orbit, map-edge coverage checks and reduced-motion support.
- Partial-name place search, native map zoom/navigation, and table-front Place/Count controls.
- A slim, nation-labelled Top Five Wars palette. It opens in the foreground, then returns left after selection or an outside click. Choosing a nation loads its native conflict and moves the map without scrolling away.
- Three independent NewsBoob players and a matching remote for station, power, volume, mute and scanning. Broadcast output remains separate from source evidence.
- Native satellite path/separation defaults, blue-tinted original water shading, and the native straits terrain/controls.
- A rebuildable derivative, native-contract tests and an input/output provenance manifest. The original atlas remains available at its existing paths.

## Evidence boundaries

This release changes presentation and interaction, not upstream source coverage. UCDP Candidate coverage remains through September 2026. Top Five ranks named conflict IDs by recorded event counts in the selected years, not casualties or a complete live measure of war size. Per-button tooltips retain observation dates and counts. Unknown placeholder-only conflicts are excluded from this shortcut list, not from the dataset. No ineligible casualty rollups are generated.

Satellite proximity is a frozen model rather than live tracking. Bab el-Mandeb supplies terrain reference only; vessel observations cover Hormuz. Live broadcasters and external script dependencies require network access and may be restricted by browser or provider policies. Reduced-motion settings leave automatic Orbit off.

## Build and validation

```sh
python3 -m src.generate_war_room
python3 -m unittest tests.test_war_room_adapters
```

Outputs live at `outputs/war-room/`, beside the existing native assets in `outputs/web/`. Validation covers native calculation/filter/inspector seams, missing-seam failure, derivative path containment, JavaScript syntax and browser interactions. Production verification is recorded separately after deployment; local checks do not establish a live deployment.
