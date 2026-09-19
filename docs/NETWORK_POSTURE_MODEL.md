# Conflict-network posture and strategic model

The conflict network now separates three different things that must not be collapsed:

1. **Source observations** — UCDP conflict-year and candidate-event records, including their dates, territories, parties, source text, and fatality ranges.
2. **A spatial posture inference** — a transparent visualization rule that estimates whether the casualties reported in an event occupy a defensive or offensive territorial posture.
3. **Legal analysis** — questions of aggression, self-defense, distinction, proportionality, precautions, and responsibility. The posture inference does **not** answer these questions.

## Spatial posture inference

For a candidate event, the model compares the reported country with `side_a_states` and `side_b_states`. When exactly one side contains the territorial state, the territory contributes **70% base confidence** that casualties coded to that host side occupy a defensive posture and casualties coded to the foreign side occupy an offensive posture. If military casualties are reported for only one side, the model adds 15 percentage points. Reciprocal casualties add no directional weight. Source text containing a narrow territorial-recovery vocabulary (`recapture`, `retake`, `regain`, or `liberate`) preserves a defensive reading for the territorial side; it does not independently identify the acting party.

The UCDP candidate schema in this build does not reliably identify the attacker for each event. When the host cannot be joined to one belligerent side, or casualties cannot be assigned directionally, the posture is mixed or indeterminate. Every selected observation exposes its score, inputs, and limits. Blue means the casualties are modeled as more defensive, red means more offensive, and the intermediate color means uncertainty or mixture. This is not a finding that a party acted lawfully or unlawfully.

## Sovereign composite nodes

A country, its coded `Government of …` participant, and its unactivated citizens begin as one sovereign node. This reduces duplicate government/country nodes and makes the first view readable. The inspector's **Isolate regime** control expands the government into a distinct regime node while retaining its relation to the sovereign node. Citizens remain enclosed in the sovereign node unless a source makes them a directly observed participant or casualty class. “Included” never means politically represented by the government.

## Strategic-balance measures

The **structural zero-sum proxy** is the share of non-observation entities connected exclusively to one belligerent side among entities connected exclusively or bilaterally to the two sides. It describes separation in this encoded graph. It does not measure utilities, prove that gains and losses sum to zero, or establish intent.

**Potential equilibrium bridges** are nodes connected to both sides or nodes with high positive betweenness in the selected graph. They identify structural positions through which a settlement, constraint, exchange, or information path might pass. They do not predict agreement or prescribe a negotiating party.

## War Register and focal time

Each interface has a focal date. An active conflict opens through today but discloses its latest observed source date. The War Register lists only dates carrying source records; days without records are absent. Selecting or playing a date rebuilds the cumulative network from the selected start boundary through that focal date. Absence from a date is not evidence that nothing happened.

## Legal-reference boundary

The model uses law as an inspectable reference layer, not as a score-generating shortcut:

- [UN Charter, full text](https://www.un.org/en/about-us/un-charter/full-text), especially Articles 2(4) and 51, addresses the prohibition on force and self-defense between states.
- [ICRC Customary IHL Rule 7](https://ihl-databases.icrc.org/en/customary-ihl/v1/rule7) requires distinction between civilian objects and military objectives.
- [ICRC Customary IHL Rule 14](https://ihl-databases.icrc.org/en/customary-ihl/v1/rule14) addresses proportionality in attack.
- [ICRC Customary IHL Rule 15](https://ihl-databases.icrc.org/en/customary-ihl/v1/rule15) addresses feasible precautions in attack.
- [Additional Protocol I, Article 52](https://ihl-databases.icrc.org/en/ihl-treaties/api-1977/article-52) defines the protection of civilian objects and the conditions for a military objective.
- [Universal Declaration of Human Rights](https://www.ohchr.org/en/human-rights/universal-declaration/translations/english), including Article 3, states the right to life, liberty, and security of person.

These bodies of law have distinct scopes, thresholds, participants, and evidentiary requirements. A territory, casualty count, graph edge, posture score, or asymmetric event is insufficient on its own for a legal conclusion.
