"""Verify an extracted War Ephemeris capsule without dependencies or network."""
import argparse
import hashlib
import json
from pathlib import Path


def verify(root):
    root=Path(root).resolve()
    manifest=json.loads((root/"MANIFEST.json").read_text())
    if manifest.get("format")!="war-maps-recovery-1":
        raise ValueError("Unsupported capsule format")
    for entry in manifest["files"]:
        p=(root/entry["path"]).resolve()
        if not p.is_relative_to(root) or p.is_symlink():
            raise ValueError("Unsafe archive path")
        blob=p.read_bytes()
        if len(blob)!=entry["bytes"] or hashlib.sha256(blob).hexdigest()!=entry["sha256"]:
            raise ValueError("Verification failed: "+entry["path"])
    return len(manifest["files"])


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--verify",type=Path,required=True)
    args=parser.parse_args()
    print(f"Verified {verify(args.verify)} archived files")
