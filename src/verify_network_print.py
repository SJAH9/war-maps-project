"""Validate print sizes and recover/rebuild the archived static site offline."""
import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from pypdf import PdfReader
from src.conflict_networks import ROOT
from src.restore_ephemeris import verify


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    out=ROOT/"outputs/print"
    register=json.loads((out/"conflict-network-register.json").read_text())
    active=[m for m in register["networks"] if m["active_2026"]]
    expected=[
        ("war-maps-conflict-networks-top-10-mortality.pdf",10,(1296,1728)),
        ("war-maps-event-networks-2026.pdf",1,(1296,1728)),
        ("war-maps-event-networks-all-time.pdf",1,(1296,1728)),
        ("war-maps-mortality-2026.pdf",1,(1296,1728)),
        ("war-maps-mortality-2025.pdf",1,(1296,1728)),
        ("war-maps-mortality-2024.pdf",1,(1296,1728)),
        ("war-maps-conflict-networks-2026.pdf",len(active),(612,792)),
        ("war-ephemeris.pdf",None,(612,792))]
    for name,count,size in expected:
        reader=PdfReader(out/name)
        if count is not None:assert len(reader.pages)==count,(name,len(reader.pages),count)
        assert all((float(p.mediabox.width),float(p.mediabox.height))==size for p in reader.pages),name
        assert (out/name).stat().st_size<100*1024*1024,f"{name} exceeds GitHub's single-file limit"
        print(f"{name}: {len(reader.pages)} pages, {size} pt",flush=True)
    with tempfile.TemporaryDirectory(prefix="war-ephemeris-verify-") as temporary:
        root=Path(temporary)
        embedded=reader.attachments["war-maps-recovery.zip"][0]
        assert hashlib.sha256(embedded).hexdigest()==sha(out/"war-ephemeris-recovery.zip")
        archive=root/"recovery.zip"
        archive.write_bytes(embedded)
        recovered=root/"recovered"
        recovered.mkdir()
        with zipfile.ZipFile(archive) as z:
            for name in z.namelist():
                assert (recovered/name).resolve().is_relative_to(recovered.resolve()),name
            z.extractall(recovered)
        n=verify(recovered)
        before={str(p.relative_to(recovered)):sha(p)
                for p in (recovered/"outputs/web").rglob("*") if p.is_file()}
        subprocess.run([sys.executable,"-m","src.generate_web_atlas"],cwd=recovered,check=True)
        after={str(p.relative_to(recovered)):sha(p)
               for p in (recovered/"outputs/web").rglob("*") if p.is_file()}
        assert before==after,"Recovered website regeneration drifted"
        print(f"Capsule: {n} files verified; {len(before)} static site files rebuilt byte-for-byte without fetching sources")


if __name__=="__main__":
    main()
