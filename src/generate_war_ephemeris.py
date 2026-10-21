"""Lossless tabular snapshot plus an embedded, hash-verified recovery capsule."""
from __future__ import annotations

import hashlib
import json
import re
import zipfile
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

from src.conflict_networks import ROOT
from src.generate_network_print import PAPER, INK, MUTED, GRID, ORANGE, fonts, frame, text, para

RECOVERY = """WAR MAPS EPHEMERIS / RECOVERY CONTRACT

This capsule contains the archived static site, generator source, local raw
inputs, curated inputs, exact generated data, and the print network register.
It excludes .git, credentials, caches, virtual environments and generated PDFs.
Nothing here calls a remote source during verification or static recovery.

1. Extract recovery.zip from the PDF's attachment panel (not a browser's
   print-to-PDF command; that would discard the attachment).
2. Unzip into a NEW EMPTY directory. Run:
     python3 src/restore_ephemeris.py --verify .
   This checks every archived file against SHA-256 in MANIFEST.json.
3. The exact archived static site is in outputs/web. Serve it with:
     python3 -m http.server 8000 --directory outputs/web
4. Regenerate the core site from archived inputs:
     python3 -m src.generate_web_atlas
   This uses the Python standard library. Loaded derived health/fuel/terrain
   assets are preserved in web/; their upstream exports need not be reachable.
5. Rebuild the print publications:
     python3 -m pip install -r requirements.txt
     python3 -m src.generate_network_print
   Installation needs an existing package cache or package index. Python and
   dependency binaries are NOT included. The data survives upstream loss;
   this is not a bootable or dependency-vendored operating environment.

All data printed in the ephemeris also exists as exact machine-readable input
or a generated asset in this capsule. No OCR is needed for digital recovery.
The printed tables alone are not a replacement for the source-code attachment.
Typography can vary across systems; graph seed and data selection are fixed.

BOUNDARIES:
- Site data are frozen local snapshots, not assertions of freshness today.
- Dynamic Hormuz AIS/vessel APIs and HLS broadcasts are external live services.
  Source URLs/configuration are preserved, not future positions or video bytes.
  Offline recovery restores the static site and its data, not those services.
- Historical GED is archived in data/raw/ged261-csv.zip; conflict-network
  aggregation keeps all eligible recorded years. Annual ACD can predate GED.
- Original licensed upstream health exports not present locally cannot be
  recreated; the site's exact derived health arrays are included instead.
- Browser visualization libraries loaded from CDNs still require those CDNs
  or a separately provisioned local copy; rebuilding static files is offline,
  but every interactive view is not guaranteed to operate without networking.
- Keep each publisher's attribution, license and provisional-data caveats.
"""


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def write_capsule(root, out):
    files = {}
    # Explicit, bounded project directories; never archive user home or hidden files.
    for directory in ("src", "tests", "docs", "data/raw", "data/curated", "web", "outputs/web"):
        for p in sorted((root/directory).rglob("*")):
            if not p.is_file() or p.is_symlink():
                continue
            rel=p.relative_to(root)
            if any(part.startswith(".") or part=="__pycache__" for part in rel.parts):
                continue
            if p.suffix in (".pyc",):
                continue
            if str(rel)=="data/raw/ged251-csv.zip":
                continue  # Superseded archive, not an input to the recovered build.
            files[str(rel)] = p.read_bytes()
    for rel in ("README.md","LICENSE","SECURITY.md","index.html","requirements.txt","data/SOURCES.json","data/refresh-2026-10-19.json",
                "outputs/print/conflict-network-register.json"):
        p=root/rel
        if p.exists():files[rel]=p.read_bytes()
    files["RECOVERY.txt"]=RECOVERY.encode()
    manifest={"format":"war-maps-recovery-1","files":[
        {"path":name,"bytes":len(blob),"sha256":digest(blob)} for name,blob in sorted(files.items())]}
    files["MANIFEST.json"]=(json.dumps(manifest,indent=2)+"\n").encode()
    target=out/"war-ephemeris-recovery.zip"
    with zipfile.ZipFile(target,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for name,blob in sorted(files.items()):
            info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o644<<16
            z.writestr(info,blob)
    return target, manifest


def datasets(data, register, root=ROOT):
    core=(root/"outputs/web/data.js").read_text()
    core=json.loads(core[core.index("=")+1:].strip().rstrip(";"))
    if core != data:
        raise ValueError("Website core data differs from the generator. Reconcile or regenerate outputs/web first.")
    yield "Core atlas / outputs/web/data.js",data
    for p in sorted((root/"outputs/web").glob("*data.js")):
        if p.name=="data.js":
            continue
        content=p.read_text()
        # Parse JSON assignment, never execute supplied JavaScript.
        match=re.fullmatch(r"\s*window\.[A-Z_]+\s*=\s*(.*?)\s*;?\s*",content,re.S)
        if not match:
            raise ValueError(f"Cannot losslessly parse {p}")
        payload=match[1].rstrip(";").rstrip()
        yield str(p.relative_to(root)),json.loads(payload)
    for p in sorted(p for p in (root/"outputs/web").rglob("*") if p.suffix in (".json",".geojson")):
        yield str(p.relative_to(root)),json.loads(p.read_text())
    for p in sorted((root/"data/curated").glob("*.json")):
        yield str(p.relative_to(root)),json.loads(p.read_text())
    yield "Print network register / all nodes, edges, weights, years and evidence IDs",register


def records(value,path="$"):
    """Rows remain reversible JSON values; collection indices preserve ordering."""
    if isinstance(value,dict):
        for k,v in value.items():
            yield from records(v,path+"."+k)
    elif isinstance(value,list) and value and isinstance(value[0],dict):
        for i,v in enumerate(value):
            yield f"{path}[{i}]",v
    elif isinstance(value,list) and len(value)>100:
        # Numerical raster/vector arrays are exact, not downsampled.
        for i in range(0,len(value),100):
            yield f"{path}[{i}:{min(i+100,len(value))}]",value[i:i+100]
    else:
        yield path,value


class Ledger:
    """Streaming two-column table; oversized records continue with explicit IDs."""
    def __init__(self,path):
        self.c=canvas.Canvas(str(path),pagesize=(612,792),pageCompression=1,invariant=1)
        self.c.setTitle("War Ephemeris | Complete Static Data and Recovery Capsule")
        self.page=0
        self.section=""
        self.index=[]
        self.y=0
        self.row_count=0

    def page_start(self):
        if self.page:self.c.showPage()
        self.page+=1
        frame(self.c,612,792,self.page,"WAR EPHEMERIS / ATTRIBUTED DATA REGISTER")
        text(self.c,"WAR EPHEMERIS",32,742,13,ORANGE,True)
        self.y=para(self.c,self.section,32,716,548,9)-15
        self.c.setFillColor(INK);self.c.rect(32,self.y-17,548,20,fill=1,stroke=0)
        text(self.c,"RECORD / PATH",37,self.y-10,7.25,PAPER,True)
        text(self.c,"VALUES / JSON NOTATION (EXACT, NO ROUNDING)",156,self.y-10,7.25,PAPER,True)
        self.y-=23

    def section_start(self,title):
        self.section=title
        self.page_start()
        self.index.append((title,self.page))
        self.c.bookmarkPage(f"s{len(self.index)}")
        self.c.addOutlineEntry(title,f"s{len(self.index)}",level=0)

    def row(self,ident,value):
        # JSON syntax preserves null vs zero, booleans, arrays and nested keys.
        s=json.dumps(value,ensure_ascii=False,separators=(", ",": "),allow_nan=False)
        # simpleSplit does not split long unbroken URLs/tokens; split by measured
        # character width first so no cell can bleed into the adjacent column.
        def wrap(s,width):
            lines=[];current="";used=0
            for char in s:
                cw=widths.get(char)
                if cw is None:
                    cw=widths[char]=self.c.stringWidth(char,"WM",7.25)
                if used+cw>width and current:
                    lines.append(current);current="";used=0
                current+=char;used+=cw
            if current:lines.append(current)
            return lines or [""]
        widths=_WIDTHS
        vals=wrap(s,416)
        ids=wrap(ident,111)
        cursor=0
        while cursor<max(len(vals),len(ids)):
            capacity=int((self.y-46)/9.5)
            if capacity<2:self.page_start();capacity=int((self.y-46)/9.5)
            n=min(capacity,max(len(vals),len(ids))-cursor)
            h=n*9.5+6
            if self.row_count%2==0:
                self.c.setFillColorRGB(.91,.90,.85);self.c.rect(32,self.y-h,548,h,fill=1,stroke=0)
            self.c.setStrokeColor(GRID);self.c.setLineWidth(.3)
            self.c.line(150,self.y,150,self.y-h)
            for j in range(n):
                idx=cursor+j
                if cursor and j<len(ids):
                    text(self.c,ids[j],37,self.y-9-j*9.5,7.25,MUTED)
                elif not cursor and idx<len(ids):
                    text(self.c,ids[idx],37,self.y-9-j*9.5,7.25,MUTED)
                if idx<len(vals):text(self.c,vals[idx],156,self.y-9-j*9.5,7.25)
            self.y-=h
            self.c.line(32,self.y,580,self.y)
            cursor+=n
            if cursor<max(len(vals),len(ids)):self.page_start()
        self.row_count+=1

    def matrix(self, title, headers, rows, widths):
        """Conventional, repeat-header data table for reading and comparison."""
        self.section=title
        def start():
            if self.page:self.c.showPage()
            self.page+=1
            frame(self.c,612,792,self.page,"WAR EPHEMERIS / READING TABLES")
            text(self.c,"WAR EPHEMERIS",32,742,13,ORANGE,True)
            self.y=para(self.c,title,32,716,548,9)-15
            self.c.setFillColor(INK);self.c.rect(32,self.y-29,548,32,fill=1,stroke=0)
            x=32
            for name,width in zip(headers,widths):
                for j,line in enumerate(simpleSplit(name,"WMB",7.25,width-8)):
                    text(self.c,line,x+4,self.y-9-j*9.5,7.25,PAPER,True)
                x+=width
            self.y-=34
        start()
        self.index.append((title,self.page))
        self.c.bookmarkPage(f"s{len(self.index)}")
        self.c.addOutlineEntry(title,f"s{len(self.index)}",level=0)
        for i,row in enumerate(rows):
            lines=[]
            for value,width in zip(row,widths):
                s="null" if value is None else str(value)
                # Preserve full values, split long identifiers if required.
                tokens=[]
                for token in s.split():
                    chunk=""
                    for ch in token:
                        if self.c.stringWidth(chunk+ch,"WM",7.25)>width-8:
                            tokens.append(chunk);chunk=""
                        chunk+=ch
                    if chunk:tokens.append(chunk)
                lines.append(simpleSplit(" ".join(tokens),"WM",7.25,width-8) or [""])
            height=max(map(len,lines))*9.5+6
            if height>590:raise ValueError("Reading table row too tall; use complete-record appendix")
            if self.y-height<45:start()
            if i%2==0:
                self.c.setFillColorRGB(.91,.90,.85);self.c.rect(32,self.y-height,548,height,fill=1,stroke=0)
            x=32
            for cell,width in zip(lines,widths):
                for j,line in enumerate(cell):text(self.c,line,x+4,self.y-9-j*9.5,7.25)
                x+=width
            self.y-=height
            self.c.setStrokeColor(GRID);self.c.setLineWidth(.3);self.c.line(32,self.y,580,self.y)
            self.row_count+=1

    def finish(self):
        self.c.save()


_WIDTHS={}


def generate(data,register,out):
    fonts()
    capsule,manifest=write_capsule(ROOT,out)
    tmp=out/"war-ephemeris-tables.tmp.pdf"
    ledger=Ledger(tmp)
    ledger.section_start("Reader's contract / interpretation and recovery")
    ledger.row("title","War Ephemeris - the War Maps static-data almanac")
    ledger.row("scope","Every value in the local site's core atlas, auxiliary *data.js files, "
               "JSON assets, curated inputs and print-network register is tabulated below. "
               "This is a snapshot, not a claim that every source is current. "
               "External live vessel endpoints and HLS media are service dependencies, not archived data.")
    ledger.row("reading","Two-column tables use exact JSON notation at 7.25 pt. "
               "Paths identify each original collection and array index. Wrapped lines are continuations, "
               "not extra records. Null is unknown, never zero. No numeric rounding is applied. "
               "Long provenance enclosures are retained. PDF bookmarks and the final index locate sections.")
    ledger.row("network method","Undirected, aggregated actor-theatre networks. Actors use exact source-coded names, "
               "not inferred aliases; renamed actors may appear separately. Theatres use country + adm_1, "
               "with missing subdivisions explicitly labelled. Civilian categories are country-scoped, "
               "not merged into a synthetic worldwide civilian actor. Coded side links do not establish who attacked. "
               "Historical annual records join only state-based events with the same stable conflict ID. "
               "GED 1989-2025 and candidate Jan-Aug 2026 supplement annual ACD 1946-2025; earlier event-level "
               "coverage is unavailable. No universal conflict hub is inserted. All graph nodes and edges "
               "are drawn, but labels are selective. Edge counts distinguish annual from event evidence. "
               "Centrality is unweighted and normalized; above 128 nodes betweenness samples 128 sources, seed 2026.")
    ledger.row("mortality ranking","Current top-ten posters rank summed best event fatality estimates over all "
               "available years. Latest candidate revision replaces matching event IDs; annual totals are not added. "
               "Missing estimates remain separately counted. Candidate observations are provisional, and distinct "
               "IDs may contain overlapping reports: these sums are not verified unique-person death tolls. "
               "No quality eligibility threshold is applied to mortality ranking.")
    ledger.row("event posters","Separate 2026 and all-time incidence posters connect every event to its conflict, "
               "coded sides and recorded country. Fatal events (best > 0) are red; zero/unknown grey. "
               "Sides/countries are conflict-scoped. These posters do contain explicit conflict hubs; "
               "the actor-theatre method above applies to the ranked posters and Letter atlas.")
    ledger.row("original quality ranking","Original top-five eligibility: >=10 events, >=8 nodes, >=10 edges. Score = complete-event fraction "
               "x ln(1+event count) x ln(1+node count). Complete = both sides, country, adm_1, date_start "
               "and at least one source headline/article/original citation. This ranks recorded detail, "
               "not significance, violence or objective completeness. All 2026-active conflicts, including "
               "sparse ones, are retained in the Letter atlas.")
    ledger.row("network references",[
        {"author":"Albert-Laszlo Barabasi","title":"Network Science, chapters 2 and 4",
         "url":"https://networksciencebook.com","use":"Degree, components, hubs; no power-law claim"},
        {"publisher":"UCDP","url":"https://ucdp.uu.se/downloads/",
         "use":"GED 26.1, candidate releases, and UCDP/PRIO ACD 26.1; preserve source coding and CC BY attribution"}])
    ledger.row("recovery",RECOVERY)
    ledger.row("capsule SHA-256",digest(capsule.read_bytes()))
    ledger.section_start("Attribution / source catalogue")
    for s in data["sources"]:ledger.row(s["id"],s)
    ledger.matrix("Reading table / conflicts / UCDP ACD 26.1 + candidate releases Jan-Aug 2026",
                  ["Conflict ID","Title","First year","Last year","Type"],
                  ([r["id"],r["title"],r.get("first_active_year"),r.get("last_active_year"),r["type"]]
                   for r in data["conflicts"]),[95,255,45,45,108])
    ledger.matrix("Reading table / event observations / UCDP candidate Jan-Aug 2026 / provisional; no casualty sums",
                  ["Event ID","Conflict ID","Start / end","Country / place","Coded side A / side B"],
                  ([r["id"],r["conflict_id"],r["date_start"]+" / "+r["date_end"],
                    r["country"]+" / "+r["place"],r["side_a"]+" / "+r["side_b"]]
                   for r in data["events"]),[54,85,92,153,164])
    metrics=list(data["state_conditions"][0]["conditions"])
    for start in range(0,len(metrics),5):
        cols=metrics[start:start+5]
        ledger.matrix("Reading table / V-Dem v16 country-years / original indicator codes; estimates are not event causation",
                      ["Country","Year"]+cols,
                      ([r["country"],r["year"]]+[r["conditions"].get(k) for k in cols]
                       for r in data["state_conditions"]),[138,40]+[370/len(cols)]*len(cols))
    ledger.matrix("Reading table / conflict network atlas / source-derived topology, not causal attribution",
                  ["UCDP ID / type","Conflict","Years","Events","Nodes","Links"],
                  ([m["key"][1]+" / "+m["key"][0],m["title"],
                    str(min(map(int,m["years"])))+"-"+str(max(map(int,m["years"]))),
                    m["events"],len(m["nodes"]),len(m["edges"])] for m in register["networks"]),
                  [72,242,72,54,54,54])
    for name,payload in datasets(data,register):
        # Give every major collection a bookmark and repeat source identity on every page.
        sections=payload.items() if isinstance(payload,dict) else [("$",payload)]
        for field,values in sections:
            title=f"{name} / {field}"
            ledger.section_start(title)
            start=ledger.page
            for ident,value in records(values,"$."+field):
                ledger.row(ident,value)
            print(f"Ephemeris pp {start}-{ledger.page}: {title}",flush=True)
    ledger.section_start("Recovery file manifest / SHA-256, size, relative path")
    for row in manifest["files"]:ledger.row(row["path"],{k:v for k,v in row.items() if k!="path"})
    index=list(ledger.index)
    ledger.section_start("Section index / page numbers")
    for title,page in index:ledger.row(str(page),title)
    ledger.finish()
    print(f"Embedding recovery capsule in {ledger.page}-page ephemeris",flush=True)
    reader=PdfReader(tmp)
    writer=PdfWriter()
    writer.clone_document_from_reader(reader)
    writer.add_attachment("war-maps-recovery.zip",capsule.read_bytes())
    writer.add_attachment("RECOVERY.txt",RECOVERY.encode())
    writer.add_metadata({"/Title":"War Ephemeris", "/Subject":"Complete static data; embedded recovery capsule",
                         "/Author":"The War Maps Project"})
    final=out/"war-ephemeris.pdf"
    with final.open("wb") as f:writer.write(f)
    tmp.unlink()  # Only this generator-owned intermediate.
    report={"pages":ledger.page,"rows":ledger.row_count,"files":len(manifest["files"]),
            "capsule_sha256":digest(capsule.read_bytes()),"index":[{"section":t,"page":p} for t,p in index]}
    (out/"war-ephemeris-index.json").write_text(json.dumps(report,indent=2)+"\n")
    print(f"Ephemeris ready: {ledger.page} pages / {ledger.row_count} rows",flush=True)


if __name__=="__main__":
    from src.build_atlas import build
    out=ROOT/"outputs/print"
    generate(build(),json.loads((out/"conflict-network-register.json").read_text()),out)
