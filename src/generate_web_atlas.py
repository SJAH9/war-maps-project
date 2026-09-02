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
    data = build()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pages = sorted(path.name for path in SOURCE.glob("*.html"))
    for name in (*pages, "styles.css", "app.js", "nation.js", "network.js", "life-death.js", "life-death-data.js", "information.js"):
        shutil.copy2(SOURCE / name, OUTPUT / name)
    shutil.copytree(SOURCE / "assets", OUTPUT / "assets", dirs_exist_ok=True)
    shutil.copy2(GEOMETRY, OUTPUT / "assets/world.geojson")
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
