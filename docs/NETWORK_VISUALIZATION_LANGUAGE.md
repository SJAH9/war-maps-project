# Network visualization language

The War Maps Project uses one interaction language across the Conflict Network, Relationship Browser, and 3D Relationship Browser. A view should expose five to nine primary information chunks; seven is the default. This is an interface limit, not a limit on the underlying evidence.

## Stable vocabulary

1. **Search** finds a node and begins or redirects a path.
2. **Scope** chooses the conflict, time boundary, or corpus extent.
3. **Filter** controls which node classes are emphasized or admitted.
4. **Connections** controls the relationship evidence and its threshold. A conflict-specific view may use **Time** here when its relationships are fixed by the selected record.
5. **View** changes representation or fits the current field without changing evidence.
6. **Layout** selects a spatial model. **Arrange** applies it. Neither operation creates evidence.
7. **Actions** holds reset, data, help, and transitions to another renderer. In a path-following browser this becomes **Path**, **Reset**, and **Exit**, while Search, Filter, Layout, and Arrange remain stable.

## Visual rules

- A command chunk has one uppercase category label and one principal control or tightly related control pair.
- Orange identifies an arrangement action; teal identifies a transition to another network renderer.
- Fit changes the camera. Reset changes selection or returns to the starting node. Arrange changes node positions. These verbs are never interchangeable.
- Inspectors remain beside the field and report the selected node. Registers remain chronological or relational lists. Neither is placed inside the command deck.
- Node colors describe semantic classes consistently within a view. A legend must say when a view uses conflict roles instead of archive-wide entity classes.
- Secondary controls use a disclosure menu so the primary deck remains scannable.
- Responsive layouts wrap chunks as units; controls inside a chunk do not separate from their label.

## View-specific seven

| View | Seven primary chunks |
| --- | --- |
| Conflict Network | Scope, Time, Search, Filter, Layout, View, Evidence |
| Relationship Browser | Search, Scope, Filter, Connections, View, Layout, Actions |
| 3D Network Browser | Search, Filter, Layout, Arrange, Path, Reset, Exit |

The labels may become shorter on small screens, but their meaning and order should remain stable.
