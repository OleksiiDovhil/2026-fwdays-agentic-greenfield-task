# Phase 1 — Clarifications & Reconciliations

The user supplied a complete, already-numbered `docs/requirements.md` and
`docs/product-brief.md`. Phase 1 therefore adopts them as the source of truth
rather than re-deriving them. Two reconciliations and the resolved defaults are
logged here for the audit trail.

## Reconciliations applied

1. **FR-SEARCH-06 added** (geolocation "Use my location" button).
   - *Gap:* the product brief and the **accepted** constraint **BC-PRIVACY-02**
     both mandate an opt-in "Use my location" button (geolocation only on
     explicit action, never on load), and the brief cites it as `FR-SEARCH-06`,
     but the requirements city-search table stopped at FR-SEARCH-05.
   - *Resolution:* added FR-SEARCH-06 to `docs/requirements.md` so the
     enumeration matches the brief and BC-PRIVACY-02. This is a faithful
     reconciliation of an omission, **not** a scope change — the feature was
     already in MVP scope.

2. **FR-SEARCH-05 zero-results literal reconciled to Ukrainian.**
   - *Gap:* FR-SEARCH-05 (`docs/requirements.md`) and the product brief quote the
     inline zero-results string in English as "Nothing found", but the product is
     Ukrainian-first and calm with no exclamation marks (NFR-I18N-01,
     BC-BRAND-01, BC-BRAND-02). The literal as written in the FR contradicts the
     shipped UI language.
   - *Resolution:* the FR fixes the **meaning** (an inline, non-toast empty
     state); the `city-search` spec fixes the **shipped literal** as the
     Ukrainian "Нічого не знайдено", with the English "Nothing found" retained as
     the `en.ts` fallback. This is a faithful UA-first reconciliation of copy,
     **not** a behavior or scope change — consistent with the FR-SEARCH-06
     reconciliation above.

## Open design freedoms (intentionally left to specs/implementation)

These are not ambiguities to resolve now; they are decisions the spec + pure
function own, and the eval rubric grades their quality:

- **Comfort-score formula (FR-COMFORT-02).** Inputs are fixed (feels-like temp,
  precip probability, wind, cloud cover, UV) but the exact weighting curve is a
  design decision of the pure `comfortScore` function. The spec will pin the
  contract (0–100, green ≥70 / yellow 40–69 / red <40, ≤80-char Ukrainian
  rationale) and tests + an eval will guard behavior and rationale quality.
- **Deterministic jokes corpus (FR-JOKES-01).** Content authored in-repo,
  Ukrainian, calm tone, no exclamation marks (BC-BRAND-01); selection is
  deterministic (no external API, no tracking).
- **Design tokens / DESIGN.md (BC-BRAND-01).** Palette chosen in Phase 4 must
  meet WCAG-AA contrast (NFR-A11Y-02), verified computationally (ADR-0004).

## Scope confirmation

- MVP includes weekend-compare (FR-COMPARE-01/02/03), promoted to MVP per the
  brief (Checkpoint 1).
- Out-of-scope list (push, accounts/history, marine/aviation, i18n beyond UA+EN,
  native app, climate/historical) is honored — none built.

No blocking questions remain; the build proceeds autonomously toward the eval
bar (every dimension ≥ 90).
