# The War Maps Project

The War Maps Project is an open, reproducible atlas of organized armed conflict from 1946 to the present. It applies Nested Causal Modelling as a filter for reality: observations, claims, and source accounts remain attached to their enclosures instead of being collapsed into a single authorized narrative or suppressed because they conflict.

The atlas begins with every state-based armed conflict in the UCDP/PRIO Armed Conflict Dataset 26.1 (1946-2025), adds a current-event layer from the UCDP Candidate Events Dataset through July 2026, and nests those conflict-years inside the state conditions observed in V-Dem. The first current focal centre is the Iran-Israel-United States war recorded by UCDP as conflict `16905` in its candidate data.

## First public release

The first public release establishes the reproducible observed field, the interactive world and nation explorers, configurable print volumes, and the ternary enclosure grammar. The project horizon is broader: **to produce navigable nested causal models of every organized conflict for which suitable peer-reviewed datasets are available**. Peer review establishes a dataset's documented scholarly provenance; it does not assign an automatic truth flag to every observation.

The current release is therefore an operational foundation, not a claim that every conflict already has a complete causal model. Each conflict begins at its available source boundary and can deepen through recursively addressed decisions, actors, conditions, claims, economic relations, alternatives, and consequences without erasing uncertainty or source context. See [First Public Release](docs/FIRST_PUBLIC_RELEASE.md).

## Ternary enclosure

The ternary enclosure function is not a three-valued truth system. It records:

```text
E = [ E(outer enclosure) | D(specified departure) | E(inner enclosure) ]
```

The first and third positions are always enclosure functions. The departure has a stable address, repeatable measurements, and join keys. Outer recursion reaches source conditions; inner recursion reaches consequences and the information consumer. The resulting record is a recursively specified causal path rather than a detached correlation. A state statement, academic dataset, user-prompted projection, or propaganda artifact can therefore remain at its proper address without receiving a premature truth flag.

Revision 1 also maps the war behind the public war. Plausible alternative histories, alleged backchannels, informal and celebrity diplomacy, and unresolved stories remain navigable projection branches. They are not collapsed into the observed chronology, but neither are they excluded for being volatile or incomplete. See `docs/REV1_SPEC.md`.

## Nation exploration

Every mapped nation opens a nation-centred record with three views. **Date** combines a zoomed map with a year timeline and the UCDP/V-Dem observations occupying that nation-year. **All time** centres the nation on a globe and maps governments coded on the same side in slate and opposing state governments in violet, with saturation driven by the number of coded conflict-years. **Raw data** exposes the joined conflict-year, country-year, and candidate-event rows and provides a JSON download.

The world map accepts a movable 1, 10, 25, 50, or all-time window. Its government-type selector uses V-Dem's `v2x_regime` vocabulary: Closed Autocracy, Electoral Autocracy, Electoral Democracy, and Liberal Democracy. "Totalitarian dictatorship" is not substituted for an official V-Dem category.

An optional satellite layer plots approximate ground tracks from a frozen CelesTrak public GP snapshot. The initial layer joins the public ICEYE catalog to ICEYE's documented constellation-level imagery support for Ukraine. That relationship does not establish that every catalogued spacecraft participated in a particular operation. Orbit geometry and conflict relationship remain separate records in the generated data.

## Build

Python 3.10 or newer builds the data and web atlas. Print generation additionally uses `fpdf2`.

```bash
python3 -m src.build_atlas
python3 -m src.generate_web_atlas
python3 -m src.generate_print_atlas --conflict ucdp-candidate-16905 --size standard
python3 -m unittest discover -s tests
```

Open `outputs/web/index.html` directly, or serve the repository root:

```bash
python3 -m http.server 8765
```

## Data boundaries

- UCDP/PRIO 26.1 supplies the canonical 1946-2025 state-based conflict-year spine.
- UCDP Candidate Events supplies 11,867 unique provisional observations through July 2026. All 485 candidate conflict clusters are navigable; overlapping monthly rows replace their earlier quarterly form by stable event ID. Candidate coding is explicitly not treated as final.
- A conflict-year row is not a complete event chronology. It establishes annual participation, incompatibility, type, and intensity under UCDP definitions.
- Uppsala and V-Dem are the project data field. The project does not create a generic intake layer for outside datasets.
- Natural Earth and CelesTrak supply cartographic reference geometry only. ICEYE's operator statement supplies the separately enclosed constellation relationship; it is not treated as conflict-event data or individual satellite tasking.
- User prompts select the volatile question. NCM then projects from outer conditions inward to expose initiation, motive, decision makers, war economies, trade relations, equipment, claims, and other causal flows at the depth the nesting reaches.
- A projection is not cut off merely because the first dataset row does not contain the answer. The atlas keeps asking the next correctly nested question and documents the resulting causal path.

## Print volumes

Print volumes configure themselves to the available depth:

- `brief`: a small field map, chronology, parties, and open frontier;
- `standard`: adds the war-economy field, recursive causal flow, and prompted projection branches; and
- `archive`: retains the full available chronology and recursive evidence record.

The format does not enforce both-sideism, one-sideism, or no-sideism. It follows the enclosed causal structure, even when the resulting depth and findings are asymmetric.

## Attribution and license

Project code and original presentation are MIT licensed. UCDP data is CC BY 4.0 and must retain its own attribution. See `docs/SOURCES.md` and `data/SOURCES.json`.

The project is produced by the RTLDI Atlas Project and Sid J.A. Hubbard, with AI and data-science tools used in research and engineering. The project takes the side of accurately enclosed evidence and human life; it does not participate in prosecution of war for any belligerent.
