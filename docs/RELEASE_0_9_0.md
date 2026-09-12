# War Maps Project 0.9.0 — organization and topology layers

This release candidate adds explicit relationship criteria to the global Graph while preserving the distinction between observed evidence and modeled comparison.

## Network changes

- The conflict-specific Network page no longer presents unsupported named network layouts.
- The global Graph can display observed same-side participation, sourced organization co-membership, or both.
- The topology selector implements deterministic Barabási–Albert, Erdős–Rényi, and Watts–Strogatz synthetic comparison graphs.
- Synthetic edges are marked and described as modeled comparisons. They are never treated as UCDP observations.
- Organization edges retain their organization name and do not imply alliance, coordination, causation, or conflict participation.

## Organization layer

- United Nations: explicit 193-member roster; the build reports the subset represented by the atlas nation profiles.
- NATO: official 32-member roster.
- BRICS: official 11-member roster used by the sourced snapshot.
- World Economic Forum: 30 explicitly retained partner entities from the official partner directory. These are company-level records and are shown through the entity-aware graph path; they are not converted into state membership.
- New organizations can be added through `data/curated/organization_memberships.json` with a typed relation, entity scope, source identifier, and date boundary.

## Review gates before publication

- Inspect the Graph page in a browser for each connection criterion and topology model.
- Confirm the organization and synthetic legends remain visually distinct at normal and wide layouts.
- Review the selected WEF partner snapshot and expand or narrow it deliberately before release.
- Confirm the generated bundle and source catalog are synchronized.
- Push only after project-owner sign-off and working GitHub authentication.
