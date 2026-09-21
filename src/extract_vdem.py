#!/usr/bin/env python3
"""Extract the small V-Dem fields used by War Maps from vdemdata's R archive."""

from __future__ import annotations

import argparse
from pathlib import Path

from src.build_atlas import ROOT, VDEM_FIELDS


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path, help="Path to vdem.RData from vdemdata v16")
    parser.add_argument("--version", default="16")
    args = parser.parse_args()
    try:
        import pyreadr
    except ImportError as error:
        raise SystemExit("Install pyreadr to run this optional source-extraction step.") from error

    frames = pyreadr.read_r(str(args.archive))
    frame = frames.get("vdem")
    if frame is None:
        raise SystemExit("The archive does not contain the expected 'vdem' table.")
    identity = ["country_name", "country_text_id", "year"]
    core = identity + list(VDEM_FIELDS)
    regimes = identity + ["v2x_regime", "v2x_regime_amb"]
    missing = sorted(set(core + regimes) - set(frame.columns))
    if missing:
        raise SystemExit(f"V-Dem archive is missing required fields: {missing}")
    frame = frame.copy()
    frame["year"] = frame["year"].astype("Int64")

    raw = ROOT / "data/raw"
    core_path = raw / f"V-Dem-CY-Core-v{args.version}.csv"
    regime_path = raw / f"V-Dem-CY-Regime-v{args.version}.csv"
    frame[core].to_csv(core_path, index=False)
    frame[regimes].to_csv(regime_path, index=False)
    print(core_path)
    print(regime_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
