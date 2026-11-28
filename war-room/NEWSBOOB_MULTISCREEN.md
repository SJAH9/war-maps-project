# NewsBoob multiscreen integration

Native upstream: https://github.com/SJAH9/newsboob. The single-screen player
and its original station list, controls, scan handlers and HLS decoder remain
the source implementation. War Room adapts explicit seams; it does not replace
the standalone player or change upstream files.

`news-pool.js` is the reusable browser module. Set
`window.NewsBoobMultiscreenConfig = {playerSelector: '.news-player',
playerURL: 'player.html'}` before loading it, after the screen iframes exist.
It exposes `window.NewsBoobMultiscreen`; `warRoomPool` is a compatibility alias.
The child bridge exposes `NewsBoobPlayer` with channels/state/tune, native
mute/volume/power/scan and reload operations; `warRoomNews` is its compatibility
alias. One source owner exists per station ID. All visible screens and preview
canvases reuse decoded frames. Sources are released after 30 seconds unused
while the grid is closed. No proxy, server-side fetch or administration API is
required. Host documents must be same-origin with their player frames.

To prepare a mode for addition to the NewsBoob repository, check out its source
and run from War Maps:

```
python3 -m src.export_newsboob_multiscreen --source /path/to/newsboob --output /new/path/to/multiscreen
```

The output must be new; previous exports are preserved. The tool verifies the
native seams and rechecks source bytes before writing. `provenance.json`
records native and generated hashes. Copy the generated directory into the
NewsBoob repository as `multiscreen/`, review, then deploy with its usual static
hosting process. No War Maps or AuthorOS runtime is needed by the export.

Open `multiscreen/index.html` for standalone mode. Use
`multiscreen/index.html?mode=hosted` in a host iframe with
`allow="autoplay; fullscreen" allowfullscreen` for hosted mode. Both modes use
the same source pool and native controls, with a live channel grid and numbered
screen assignment badges. Existing standalone NewsBoob remains independent.
All asset URLs are relative, so the directory can be hosted beneath any prefix.
Use HTTP(S), as with the native HLS player; broadcaster CORS, stream availability
and browser autoplay restrictions still apply. Opening multiple independent
browser tabs creates separate pools, as expected; this module deduplicates
consumers within one multiscreen instance.

The export supports the checked upstream idle/launch startup contract and the
embedded startup contract. An unexpected native change stops the build for
review. The upstream repository has not been modified or published by this
integration work.
