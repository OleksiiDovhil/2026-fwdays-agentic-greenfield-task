// Shared type for output-eval cases (graded-quality scenarios). The eval-suite
// workflow loads each `cases: EvalCase[]`, runs `produce()` to obtain the
// user-visible output, and grades it 0-100 against `rubric` with a fresh judge
// (maker != checker). `trace` joins the case to the requirement chain
// (check-traceability.mjs scans *.eval.ts) and must mirror the bottom
// `// @trace ...` footer. See evals/README.md.
export type EvalCase = {
  /** Stable, unique id for the case (also listed in manifest.json). */
  id: string;
  /** FR/NFR/TC/BC ids this case provides evidence for; mirror the @trace footer. */
  trace: string[];
  /** Quality concern; cases sharing a dimension are averaged + ratcheted together. */
  dimension: string;
  /** Capability under grade (e.g. 'app-shell'). */
  capability: string;
  /** Plain-language description of what is being graded. */
  scenario: string;
  /** Browser-free producer of the user-visible output to grade. */
  produce: () => Promise<unknown>;
  /** Objective grading criteria; lines marked `CRITICAL:` gate the case. */
  rubric: string[];
};
