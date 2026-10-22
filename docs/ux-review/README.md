# UX review working material

The raw material behind `../UX_REVIEW.md`: one folder per reviewer of the
October 2026 panel (first-run UX, game design, 3D mode, input and
accessibility, the enthusiast loop) and the P-21 brute-force analysis. Each
folder holds the reviewer's `report.md`, the Playwright and Node scripts it
ran (`*.mjs`) and their measured outputs (`*.txt`, `*.log`, `*.json`).
`reviewer-brief.md` is the brief every reviewer received.

The scripts follow the current app's markup, presets and board limits, and
carry only the walks the app still has; a report that cites a script, or a
probe, its folder no longer holds describes a walk the app no longer has,
and that script's measured output stays as the record.

The screenshots the reports cite are not kept in the repository; the
reports describe what each showed. The scripts regenerate them against a
build served locally.
