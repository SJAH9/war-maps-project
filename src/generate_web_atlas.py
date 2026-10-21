#!/usr/bin/env python3
"""Generate the deployable War Maps web atlas."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from src.build_atlas import GEOMETRY, ROOT, build

SOURCE = ROOT / "web"
OUTPUT = ROOT / "outputs/web"


def generate() -> Path:
    from src.generate_information_pages import generate as information_pages
    from src.generate_app_shell import generate as app_shell
    information_pages()
    app_shell()
    from src.import_health_dashboard import RAW, OUTPUT as HEALTH_OUTPUT, normalize
    from src.build_civilian_casualties import build as build_casualties, write as write_casualties
    if RAW.exists():
        health = normalize(json.loads(RAW.read_text()))
        HEALTH_OUTPUT.write_text(json.dumps(health, ensure_ascii=False, indent=2) + "\n")
        write_casualties(build_casualties())
    data = build()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if RAW.exists():
        shutil.copy2(HEALTH_OUTPUT, OUTPUT / "opt-health-dashboard.json")
    pages = sorted(path.name for path in SOURCE.glob("*.html"))
    for name in (*pages, "styles.css", "gas-map.css", "gas-map-layers.css", "civilian-casualties.css", "atlas-ui.js", "app.js", "nation.js", "network-model.js", "network.js", "network-3d.js", "graph.js", "life-death.js", "life-death-data.js", "life-expectancy-data.js", "crude-birth-rate-data.js", "population-data.js", "information.js", "gas-map.js", "gas-price-model.js", "gas-price-data.js", "civilian-casualties.js", "civilian-casualty-data.js"):
        shutil.copy2(SOURCE / name, OUTPUT / name)
    for name in ("hormuz.js", "hormuz-3d.js", "hormuz.css", "drone-event-layer.js", "graphml.js"):
        shutil.copy2(SOURCE / name, OUTPUT / name)
    for name in ('brand.css','pwa.js','sw.js','manifest.webmanifest'):
        shutil.copy2(SOURCE / name, OUTPUT / name)
    shutil.copytree(SOURCE / "assets", OUTPUT / "assets", dirs_exist_ok=True)
    shutil.copytree(SOURCE / "newsmedia-player", OUTPUT / "newsmedia-player", dirs_exist_ok=True)
    shutil.copy2(GEOMETRY, OUTPUT / "assets/world.geojson")
    geometry_payload = GEOMETRY.read_text(encoding="utf-8")
    (OUTPUT / "assets/world-geometry.js").write_text(
        f"window.WAR_MAPS_GEOMETRY={geometry_payload};\n", encoding="utf-8"
    )
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    (OUTPUT / "data.js").write_text(f"window.WAR_MAPS_DATA={payload};\n", encoding="utf-8")
    (ROOT / "index.html").write_text(
        '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=outputs/web/">'
        '<title>The War Maps Project</title><a href="outputs/web/">Open the atlas</a>\n',
        encoding="utf-8",
    )
    return OUTPUT / "index.html"


def main() -> int:
    path = generate()
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
