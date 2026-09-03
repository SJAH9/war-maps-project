# War Maps Project v0.6.2

## Crude birth rate in Life and Death

This release adds crude birth rate as a fourth independently controlled measure in the Life and Death visualization.

- Adds World Bank WDI indicator `SP.DYN.CBRT.IN`, sourced primarily from UN World Population Prospects, with loaded observations for 1960-2024.
- Draws crude birth rate in an olive-to-neon-green stack beside conflict fatalities, all-cause mortality, and total fertility.
- Extends the measure-year control to 1960-2024 while leaving unavailable IHME observations missing outside their 1980-2023 source boundary.
- Reports crude birth rate in live births per 1,000 population per year.
- Explicitly distinguishes crude birth rate from total fertility rate in the interface, methods, coverage, citations, and README.
- Adds a reproducible generator, preserved API responses, source metadata, generated web artifact, and build assertions.

## Direct links

- [Open the Life and Death visualization](https://sjah9.github.io/war-maps-project/outputs/web/life-death.html)
- [Read the population-health methods](https://sjah9.github.io/war-maps-project/outputs/web/data-health.html)
- [Review source citations](https://sjah9.github.io/war-maps-project/outputs/web/sources.html)
- [Browse the source code and data](https://github.com/SJAH9/war-maps-project)
