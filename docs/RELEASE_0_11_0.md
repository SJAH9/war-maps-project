# War Maps 0.11.0 print networks and the human cost of conflict

This release brings War Maps off the screen and into print, studios, classrooms, exhibitions and media projects. Download the PDFs, inspect the underlying records, or clone the project and run the generators yourself.

The purpose is public awareness: to make the places, relationships and human losses recorded in organized conflict easier to examine, discuss and remember. These are dated records of violence, not a live feed of deaths happening today. The work is written, directed and engineered by Sid J.A. Hubbard, Principal Investigator.

## Start with the PDFs

All publications are in `outputs/print/`. The new PDFs and their companion data are also provided as release assets so you do not need Python to read or print them.

| Publication | What you can explore |
| --- | --- |
| `war-maps-conflict-networks-top-10-mortality.pdf` | Ten 18 x 24 inch posters, ranked by summed reported event mortality across available years. Each includes a conflict network, legend, degree distribution, chronology and interpretation. |
| `war-maps-event-networks-2026.pdf` | One 18 x 24 inch poster containing 13,659 candidate event observations and 539 conflict networks, including coded sides and event countries. Fatal events are red. |
| `war-maps-event-networks-all-time.pdf` | One 18 x 24 inch poster containing 431,627 available event observations across 1,886 conflict networks, from 1989 through the loaded 2026 releases. |
| `war-maps-mortality-2024.pdf`, `war-maps-mortality-2025.pdf`, `war-maps-mortality-2026.pdf` | Three matching 18 x 24 inch posters. Every filled dot represents one unit in the reported death estimates: civilian, coded-side or unknown status. The dot scale is identical across years. |
| `war-maps-conflict-networks-2026.pdf` | A 539-page US Letter atlas: one page per conflict active in the loaded 2026 records, retaining its available historical network rather than only its 2026 activity. |
| `war-ephemeris.pdf` | A 9,937-page US Letter data almanac with attribution, detailed tables, an index and an embedded recovery archive. Approximately 91 MB. |
| `war-maps-conflict-networks-top-5.pdf` | The preserved original five-poster edition, selected by recorded detail and field completeness rather than mortality. |

The mortality posters report **188,209 deaths in 2024, including 34,895 civilians**, **245,464 in 2025, including 91,566 civilians**, and **125,245 in the loaded 2026 records, including 21,000 civilians**. These are source-estimate sums, not independently identified people. The 2024 and 2025 figures use reviewed full-year GED 26.1 records. The 2026 figures use provisional January-August candidate releases; some uncertain date intervals extend into September. Do not interpret the smaller partial-year total as an annual decline.

Use a PDF reader's zoom to inspect dense networks. Print poster pages at actual size on 18 x 24 inch stock; print the atlas and Ephemeris on US Letter. A reduced-size print is useful for reference but cannot preserve the visibility of every event or dot.

## Clone and run the generators

Use Python 3.11 or newer, Git and enough disk space for a large repository and its generated PDFs. The current build was tested with Python 3.14. The Ephemeris is much slower and larger than the individual posters.

```sh
git clone --branch v0.11.0 https://github.com/SJAH9/war-maps-project.git
cd war-maps-project
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

On Windows, activate the environment with `.venv\Scripts\Activate.ps1`.

The reviewed GED ZIP is intentionally excluded from ordinary Git tracking. Restore the exact input from the included recovery archive, verifying its manifest hash before extracting only that file:

```sh
python - <<'PY'
import hashlib
import json
import zipfile
from pathlib import Path

name = "data/raw/ged261-csv.zip"
with zipfile.ZipFile("outputs/print/war-ephemeris-recovery.zip") as archive:
    manifest = json.loads(archive.read("MANIFEST.json"))
    entry = next(item for item in manifest["files"] if item["path"] == name)
    data = archive.read(name)
    assert len(data) == entry["bytes"]
    assert hashlib.sha256(data).hexdigest() == entry["sha256"]
    target = Path(name)
    if target.exists() and target.read_bytes() != data:
        raise SystemExit("A different GED input already exists; preserve it and choose deliberately.")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
print("Verified GED 26.1 restored.")
PY
```

This restores the historical input without replacing your current source code with the older recovery snapshot. All other required conflict and governance inputs are included in the clone. On PowerShell, save the Python block as a temporary `.py` file and run it with `python`.

Choose the output you want:

```sh
# The three comparable mortality posters
python -m src.generate_mortality_poster

# The complete 2026 and all-time event posters
python -m src.generate_event_network_print

# The ten mortality-ranked conflict posters and their register
python -m src.generate_network_print --ranked-only

# All current network and mortality PDFs, without the long Ephemeris
python -m src.generate_network_print --networks-only

# Everything, including a freshly rebuilt Ephemeris and recovery capsule
python -m src.generate_network_print
```

Open `outputs/print/` when generation finishes. These commands use local inputs; they do not silently download newer observations. For data updates, follow the source-specific procedures and preserve the dated provenance described in `docs/PRINT_NETWORKS.md` and `docs/DATA_REFRESH_2026-10-19.md`.

The bundled Ephemeris and recovery ZIP preserve an earlier snapshot from this print-development cycle. They do not contain the later top-ten and mortality-generator changes. Use the current tagged repository for those changes; a full generator run rebuilds the capsule with the current source.

## Examine the evidence

The PDFs are accompanied by `conflict-network-register.json`, compressed event-network registers, and annual mortality audit JSONs. These expose event IDs, source releases, graph relationships, counts and ranking decisions. The Ephemeris provides the broader tabular record and recovery structures.

An event, a conflict and a death are different units. A red event node can represent more than one estimated death; a mortality-poster dot always represents one. Unknown status remains separate from civilians and coded-side deaths. "Warfighter" is shorthand for deaths attributed by the source to side A or side B, not an independent judgment about each person's role.

Graph proximity does not establish causation, command, responsibility or an alliance. Event countries describe recorded locations, not necessarily an actor's nationality. Candidate estimates are provisional and may include overlapping reports across distinct observations. Injuries and indirect deaths outside the source's scope are not represented.

## Use the work in art and media

Print the posters, juxtapose the annual dot fields, build an exhibition around the conflict histories, or adapt selected graphics for an article, film, classroom discussion, publication or installation. Clone the generators to explore your own typography, palette or presentation while keeping the underlying units and evidence visible.

Keep the year, coverage period, legend and attribution with any excerpt. Label crops and adaptations, explain any changed scale, and retain unknown categories. A partial-year snapshot should not be presented as a full-year comparison or as a count of deaths occurring today.

Project software and original documentation use the MIT License. Upstream data retains its own terms: UCDP is CC BY 4.0, while other sources in the Ephemeris have their own attribution and reuse requirements. Review `LICENSE`, `data/SOURCES.json` and `docs/SOURCES.md` for the material you use. Linked books are not relicensed.

Suggested credit:

> War Maps Project, Sid J.A. Hubbard, Principal Investigator. Version 0.11.0, 2026. Based on UCDP GED 26.1 and the dated UCDP candidate releases identified in each graphic. Adaptations by [your name]. https://github.com/SJAH9/war-maps-project

Retain UCDP's requested scholarly citation: Sundberg, Ralph, and Erik Melander (2013), “Introducing the UCDP Georeferenced Event Dataset,” *Journal of Peace Research*, 50(4), 523-532. Definitions are available in the [GED 26.1 codebook](https://ucdp.uu.se/downloads/ged/ged261.pdf) and [candidate codebook](https://ucdp.uu.se/downloads/candidateged/ucdp-candidate-codebook1.4.pdf).

## Other changes and checks

This release also includes refreshed fuel and exchange-rate observations, the dated ICEYE orbit snapshot, updated population response provenance, and rebuilt affected web and Iran print outputs. The source audit distinguishes updated inputs from unchanged or unavailable sources.

Fifty Python tests pass, along with the fuel-price JavaScript regression. The three mortality PDFs were checked for exact vector-dot counts and matching 18 x 24 inch dimensions. The event registers were checked against every included event ID, and rendered print layouts were visually reviewed.
