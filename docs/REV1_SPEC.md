# War Maps Project Revision 1 specification

## Purpose

Revision 1 establishes a complete post-1945 conflict atlas and the recursive form needed to map the war behind the visible war. It is built to retain the tension, decisions, negotiations, economic relations, unrealized alternatives, and enclosed stories that leave the world armed.

The project is not neutral by omission and does not require both-sideism. It takes the side of complete causal addressability. Every input is eligible to enter the same nesting grammar. No government, media institution, investigator, witness, leader, diplomat, or model receives an automatic truth flag or an automatic exclusion.

## Canonical observed field

1. Every UCDP/PRIO state-based armed conflict from 1946 through 2025.
2. UCDP candidate events through July 2026, with source coding retained and overlapping releases reconciled by event ID.
3. V-Dem state conditions nested around conflict-years.
4. The Iran-Israel-United States conflict as the first current focal centre.

## Prompted projection field

User prompts may open any causally relevant branch, including:

- initiation and the decision maker who activated the path;
- territorial and economic purpose;
- war economies, partners, and trade relationships;
- equipment and force relations;
- public and concealed leadership decisions;
- plausible backchannel negotiations;
- celebrity diplomats and informal intermediaries;
- plausible alternative histories;
- unrealized ceasefires, settlements, escalations, and alliance changes; and
- the durable beneficiaries and losses enclosed by each path.

These are not treated as forbidden inferences. They are projected from outer conditions inward and remain connected to every intermediate enclosure.

## Branch classes

- `observed`: occupies the Uppsala or V-Dem data field.
- `prompted_projection`: a question-directed causal path opened by the user.
- `plausible_alternative_history`: a branch from an identified decision point whose enclosing conditions are made explicit.
- `alleged_backchannel`: a negotiation or contact reported, proposed, or modeled outside the public chronology.
- `negotiation_path`: a sequence of possible exchanges, intermediaries, concessions, and consequences.
- `unresolved_story`: a retained account whose proper nesting is not yet complete.

These labels identify the branch's relation to the observed field; they are not truth values.

## Required projection record

```text
projection_id
conflict_id
branch_class
prompt
branch_point
participants
outer_conditions
active_relation
enclosed_consequences
observable_traces
frontier_questions
```

Participants may include heads of government, commanders, ministers, business leaders, cultural figures, celebrity diplomats, intermediaries, institutions, or unknown actors. Unknown remains a valid address until the nesting exposes a person or institution.

## Interface requirements

1. The observed chronology and projected branches are visually distinct but navigable together.
2. Any event can become a branch point.
3. Any projection can open another complete ternary enclosure.
4. The user can move from a public event to decision maker, outer condition, intermediary, economic relation, and enclosed consequence.
5. No branch is deleted merely for being official, unofficial, propagandistic, unpopular, volatile, or incomplete.
6. Compact print briefs and large archival volumes use the same canonical records.
7. Every populated outer and inner position is itself an enclosure function; finite unexplored depths remain addressed `E` frontiers.
8. Every middle departure has a stable identifier and may declare repeatable measurements and join keys for additional data.

## Revision 1 completion boundary

Revision 1 is complete when the full historical register builds reproducibly, the current focal conflict carries candidate events and V-Dem conditions, prompt-directed branches render in web and print, and each branch exposes its next Final Frontier question.
