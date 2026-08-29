---
title: 'Where They Went: a citable, multilingual platform for global forced-displacement statistics'
tags:
  - forced displacement
  - refugees
  - internally displaced persons
  - open data
  - data visualization
  - reproducibility
authors:
  - name: Chih-Hua Hsu
    orcid: 0009-0005-5135-230X
    affiliation: 1
affiliations:
  - name: Independent Researcher, Taiwan
    index: 1
date: 2026-08-26
bibliography: paper.bib
---

# Summary

Where They Went (https://wheretheywent.lakkev.com) republishes seventy-five years of
official forced-displacement statistics — refugees, asylum-seekers, internally displaced,
stateless and other people of concern from UNHCR's Refugee Population Statistics Database
[@unhcr-rdf], IDMC's internal-displacement data [@idmc-gidd] and UN World Population
Prospects denominators [@un-wpp] — as an interactive world map, per-country pages, and
machine-readable downloads in seven languages (English, Traditional and Simplified
Chinese, French, Spanish, Japanese, Korean). Every view is a permanent link that
reproduces itself exactly; every download embeds source, as-of date and caveats; and the
entire pipeline, from nightly ingestion to deployment, is open and automatically
validated. Quarterly snapshots are archived on Zenodo under a version-controlled concept
DOI [@wtw-zenodo].

# Statement of need

Displacement statistics are widely cited and widely misread. The upstream sources are
authoritative but fragmented across portals, and the numbers carry structural traps:
statelessness is collected only from 2004, the IDP series switches to IDMC compilation
in 2009, and the "other people in need of international protection" category exists only
from 2018 [@egriss-irrs; @egriss-iris]; "not reported" is routinely conflated with zero; declines are read as
returns when they may be naturalisation or definitional change. General-purpose
aggregators expose the numbers but rarely the traps.

Where They Went is built so that the caveats travel with the figures. A year that was
never reported is never rendered as zero; definitional breakpoints are annotated on every
chart; a per-country coverage scorecard states first-reported year, first non-zero year
and the longest gap for every metric; and a record library recomputes all-time extremes
mechanically from the published data on every update. Content-addressed snapshot
identifiers, 22 published validation invariants checked daily in CI, and byte-identical
Zenodo archives make any figure shown on the site independently verifiable — a property
aimed at researchers, educators and anyone who needs a checkable number, in their own
language.

# Acknowledgements

All figures originate from UNHCR, IDMC and the United Nations Population Division;
boundaries from Natural Earth. Errors of presentation are ours alone; an open review
process (https://wheretheywent.lakkev.com/review) publishes all criticism and responses.

# References
