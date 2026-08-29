# Sources and evidence boundaries

## UCDP/PRIO Armed Conflict Dataset 26.1

The historical spine is the UCDP/PRIO Armed Conflict Dataset version 26.1. It defines a state-based armed conflict as a contested incompatibility concerning government or territory where armed force between two parties, at least one a state government, results in at least 25 battle-related deaths in a calendar year. The project preserves UCDP fields and identifiers in its processed output.

Citation and downloads: <https://ucdp.uu.se/downloads/>

UCDP datasets are licensed CC BY 4.0. The War Maps Project does not relicense those records under MIT.

## UCDP Candidate Events 2026

The live layer uses candidate event data through June 2026. Candidate observations are provisional. `code_status`, source count, source office, date precision, location precision, and low/best/high fatality estimates are retained. A `Clear` event is not transformed into an unrestricted fact; it remains clear within the candidate UCDP enclosure.

## V-Dem country-year conditions

The first project build uses the V-Dem v15 country-year core retained by the RTLDI Atlas pipeline. Its nine protection fields are nested around Uppsala conflict-years as observed state conditions. V-Dem supplies conditions; it is not used as an external authority that closes the projection.

## What is not inferred

The atlas does not import outside data streams to close initiation, intent, territorial gain, economic gain, force strength, equipment, or battlefield questions. User prompts open those questions, and NCM carries the projection through Uppsala and V-Dem observations toward the causal head while retaining every intermediate enclosure.
