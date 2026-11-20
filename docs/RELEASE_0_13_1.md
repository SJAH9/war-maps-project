# War Maps 0.13.1 — Conflict Sides by decade

The Conflict Sides print atlas now comes in three bookmarked US Letter books, with a period overview and annual death-circle pages in each volume:

| Book | Years | Pages |
| --- | --- | ---: |
| The 2020s | 2020–2026 | 522 |
| The 2010s | 2010–2019 | 513 |
| The 2000s | 2001–2009 | 268 |

Each dot represents one death. Each annual conflict page appears in exactly one volume. The overview in each book summarizes that volume's annual pages; it is not an additional set of deaths. Bookmarks and accompanying JSON indexes make the longer volumes navigable.

## Selection and separation

The books follow 85 conflicts active in the loaded 2026 data with at least 1,000 deaths total during 2007–2026. The qualifying window is 20 calendar years; the annual pages include nonzero years from 2001 onward, distributed into their decades. The 2000s book begins in 2001 to retain the project's this-century scope. These are histories of the selected current conflicts, not a catalogue of every conflict that occurred in each decade.

Conflicts whose entire recorded history contains exclusively civilian deaths have been removed from both annual pages and overviews, and reserved for a separate civilian deaths book. Unknown deaths are not reclassified as civilian. Civilian and unknown deaths within mixed conflicts remain with those conflicts. The whole-conflict partition prevents those deaths from appearing in both selections. The civilian book is not included in this release.

The combined atlas is reduced to 1,299 pages. The three books total 1,303 pages because each has its own cover and overview. Annual-page coverage and counts match the combined atlas exactly. Pages with zero deaths are omitted.

## Website and generators

The deployed Print editions page now offers the three decade PDFs with page counts, scope, and rebuild instructions. Conflict Sides links directly to those downloads. The offline shell cache version has been updated. The homepage carousel uses focused images of the maps, networks, circles, and satellite globe rather than full-interface screenshots.

```sh
git clone https://github.com/SJAH9/war-maps-project.git
cd war-maps-project
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m src.generate_conflict_sides_decades
```

Obtain any unbundled source datasets directly from their publishers, following the repository's source instructions. The full `python -m src.generate_print_atlas --conflict-sides` command now also generates the decade books. Outputs are in `outputs/print/`.

Use these books in art, media, teaching, and general awareness of where and how people die in organized conflict, retaining UCDP and project attribution. This release reorganizes the existing source snapshot; it does not claim a new upstream data refresh. UCDP candidate coverage remains through September 2026. The Ephemeris and experimental network/art studies are not release assets.

Validation: all annual pages occur exactly once across the three books; exact dot counts and period totals reconcile; zero-death pages are excluded; decade boundaries and the civilian-only partition are tested.
