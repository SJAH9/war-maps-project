# War Maps 0.13.0 — Conflict Sides, a new visual language, and orbital distance

This release makes War Maps easier to enter, compare, print, and reuse. The homepage now opens with a four-view carousel: Conflict map, Conflict Network, Conflict Sides, and Satellite estimated distance. Each card shows a real screen from the application and opens that view directly. The former Russia–Ukraine print promotion has been removed from the homepage.

## Conflict Sides, on screen and in print

Conflict Sides brings the death-circle poster design into the website. Each dot represents one recorded death. The smaller named-side count sits above the larger count; the website uses solid dark-gray dots without outlines for the smaller side and red dots with black outlines for the larger side. The sides remain identified by their recorded names. Civilian and unknown deaths remain separate from named-side deaths.

The website now renders these graphics as scalable SVG, including year selection, zoom, theme changes, and selection from the current-year spiral. The dropdown excludes conflicts with no recorded deaths. Download SVG preserves vector dots, labels, colors, branding, and source metadata. Downloads are restricted to 2001 onward; an All years download combines only that period and labels its actual year range.

The new **Conflict Sides print atlas** is a 3,121-page US Letter PDF with bookmarks. It opens with the 2026 spiral, greatest-loss side first in black, followed by that conflict's opposing side. Named-side deaths alone form the spiral. The following pages cover years after 2000 for conflicts active in the loaded 2026 data, omit years without deaths, cap oversized dots, and promote civilian-only counts to the main display area. The print circles retain the poster's black/red palette, with the smaller side above the larger.

Where civilian and unknown deaths outnumber named-side deaths, a second circle uses the complete population as its geometry but draws only civilian and unknown deaths. The empty portion belongs to named-side deaths already represented in the first circle. Each death is drawn once. The current-year aggregate is 140,009 deaths: 85,348 named-side deaths, 23,205 civilian deaths, and 31,456 unknown deaths.

## Satellite estimated distance — historical model, not real-time positions

The new rotating 3D Earth compares ICEYE-X36 and Kosmos 2612. It offers a historical time slider, playback, orbital trails, satellite altitudes, and a five-minute-sampled distance curve across a 30-day retrospective model.

**There is no real-time position projection and no future-position display.** Playback ends at the saved common reference time, 19 November 2026 at 15:15:13 UTC. The latest displayed separation is approximately 621 km. Positions and distances are estimates calculated from archived CelesTrak orbital elements, not confirmed telemetry.

The archive contains only one Kosmos 2612 element set. Consequently, the month-long view is explicitly a backward SGP4 model, **not a month of observed positions**. It cannot reconstruct unrecorded maneuvers; estimates become less reliable farther from the element epochs. The page exposes the epochs, method, sampling interval, and sources. Its minimum is a sampled model minimum, not a measured closest approach. This view is information design, not an intelligence or tactical product.

The world map also defaults to the paired satellite paths and estimated separation, with a dated bounding box and a saved historical cutoff.

## Look, feel, and other fixes

- Consistent War Maps theme, typography, compass branding, and light/dark behavior across the new views.
- SVG replaces the canvas display for Conflict Sides; dense all-years views retain every dot.
- Corrected casualty-ranked colors and matching legends, more consistent dot spacing, and clearer civilian/unknown placement.
- Added an expandable neutrality statement to page footers, describing the project's open-information purpose and linking to source methodology.
- Kept the homepage carousel manual, keyboard accessible, and responsive; no automatic slide rotation.
- Preserved the existing installable app shell and partial offline reading support.

## Data updates since the previous release

The November refresh imported UCDP candidate events through September 2026 (16,633 unique provisional observations), updated pump-fuel prices and exchange-rate observations, refreshed the oPt Health Cluster/WHO dashboard through November 15, updated the World Bank population response, and refreshed CelesTrak snapshots, including the paired November 19 archive. WHO and UCDP totals remain separate and are not added together.

The source-by-source audit identifies unchanged and retained inputs: [November 18 data refresh](https://github.com/SJAH9/war-maps-project/blob/main/docs/DATA_REFRESH_2026-11-18.md). This release does not imply that every upstream dataset changed.

## Clone, rebuild, and use

```sh
git clone https://github.com/SJAH9/war-maps-project.git
cd war-maps-project
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m src.generate_web_atlas
python -m src.generate_print_atlas --conflict-sides
python -m http.server 8765
```

Open `http://localhost:8765/outputs/web/`. Source retrieval instructions and provenance remain in the repository; obtain any unbundled upstream inputs from their publishers. The globe data and carousel are built through the normal web generator. Carousel screenshots can be recaptured with the optional Playwright tool, `python -m src.capture_view_screens --base-url http://localhost:8765/outputs/web`.

Use the atlas and SVGs in art, media, teaching, and public discussion, retaining source attribution. The purpose is to make visible where and how people die in organized conflict. The existing curated poster collection remains available in the prior release and on the website. The Ephemeris and withheld experimental network studies are not published in this release.
