"""Retroactive cost corrections for reports whose model had no packages/llm/src/
pricing.ts entry at the time the run was executed, so estimatedCostUsd was
silently computed at the DeepSeek-flash FLASH_FALLBACK rate instead of the
model's real rate.

Cost is baked into each trace at run time (apps/runner/src/agent.ts calls
estimateCostUsdCached once per LLM call and accumulates into
EpisodeTrace.estimatedCostUsd) and is NOT recomputed at score time -- fixing
pricing.ts alone only helps future runs. This script recomputes cost for each
already-scored report below from its already-recorded token counts (runs.csv)
using the now-confirmed rate, and rewrites runs.csv + score-report.json's
cost block in place. Idempotent: rerunning recomputes from the same
(unchanged) token counts and rates, producing the same corrected totals.

Caveat shared by every correction below: runs.csv does not persist the
cache-hit token split (only total inputTokens), so none of these
recomputations can reproduce any cache-hit discount the original run may have
received -- each is a conservative (upper-bound) re-estimate, computed at the
full (non-cached) input rate for every input token.

CORRECTIONS (run set -> (input $/M, output $/M, note)):

- glm52-streamlake-openrouter-low-100-20260821: $0.336/$1.056, confirmed
  StreamLake via OpenRouter (76% off the $1.40/$4.40 list price). NOTE: the
  canonical GLM field entry (dev-glm52-gmicloud-pinned-low-20260821) used a
  DIFFERENT OpenRouter host (gmicloud) whose rate was never confirmed --
  deliberately NOT corrected, left on the fallback rate; see
  run_manifest.json's note on that entry. Do not add it here without a
  confirmed gmicloud-specific rate.
- nemotron-ultra-deepinfra-50-20260822: $0.50/$2.20, confirmed pinned to
  DeepInfra via OpenRouter (run-set name, OpenRouter's own DeepInfra pricing
  row, and DeepInfra's own site all agree).
- inkling-small-50-20260822: $0.45/$1.20, OpenRouter, provider NOT pinned in
  this run -- three near-identical hosts exist (DeepInfra $0.45, Baseten/
  Together $0.50, all $1.20 output); using DeepInfra (lowest/most common
  default) as a best estimate, not a confirmed-for-this-run rate the way the
  other two corrections are.
- dev-v4pro-0813-gmicloud-fp8-low-20260821: $0.435/$0.87, same weights/rate as
  the existing 'deepseek-v4-pro' pricing.ts entry -- this run's exact
  modelRequested string ('deepseek/deepseek-v4-pro-0813', OpenRouter-style
  with a date suffix) didn't match that key, so it silently fell through to
  the fallback too. Now also a real pricing.ts entry (own key), so this
  correction is really only needed for the report already on disk.
"""
import csv
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

CORRECTIONS = {
    "glm52-streamlake-openrouter-low-100-20260821": (0.336, 1.056, "StreamLake via OpenRouter"),
    "nemotron-ultra-deepinfra-50-20260822": (0.5, 2.2, "DeepInfra via OpenRouter"),
    "inkling-small-50-20260822": (0.45, 1.2, "DeepInfra via OpenRouter (unpinned, best estimate)"),
    "dev-v4pro-0813-gmicloud-fp8-low-20260821": (0.435, 0.87, "same rate as deepseek-v4-pro"),
}


def recompute_cost(input_tokens: int, output_tokens: int, input_per_m: float, output_per_m: float) -> float:
    return (input_tokens / 1e6) * input_per_m + (output_tokens / 1e6) * output_per_m


def apply_correction(run_set: str, input_per_m: float, output_per_m: float, note: str) -> None:
    report_dir = REPO / "reports" / "dev" / run_set
    runs_path = report_dir / "runs.csv"
    score_path = report_dir / "score-report.json"
    if not runs_path.is_file() or not score_path.is_file():
        print(f"[fix_pricing] {report_dir} missing runs.csv/score-report.json -- skipping")
        return

    rows = list(csv.DictReader(runs_path.open(newline="", encoding="utf-8")))
    fieldnames = list(rows[0].keys())
    completed_rows = [r for r in rows if r["status"] == "completed"]
    # Scoped to completed rows only, matching new_total's scope below -- rejected/failed
    # rows' costs are never touched by this script (they're excluded from totalCostUsd by
    # the scorer itself), so including them here would make "old" a moving target across
    # reruns for reasons unrelated to this correction.
    old_total = sum(float(r["estimatedCostUsd"]) for r in completed_rows if r["estimatedCostUsd"])

    new_total = 0.0
    for r in rows:
        if r["status"] != "completed" or not r["inputTokens"]:
            continue
        new_cost = recompute_cost(int(r["inputTokens"]), int(r["outputTokens"]), input_per_m, output_per_m)
        r["estimatedCostUsd"] = f"{new_cost:.6f}"
        new_total += new_cost

    with runs_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    score = json.loads(score_path.read_text(encoding="utf-8"))
    n = len(completed_rows)
    score["cost"]["totalCostUsd"] = new_total
    score["cost"]["meanCostUsd"] = new_total / n if n else 0.0
    score_path.write_text(json.dumps(score, indent=1) + "\n", encoding="utf-8")

    print(f"[fix_pricing] {run_set}: totalCostUsd corrected {old_total:.4f} -> {new_total:.4f} "
          f"(fallback -> {note} ${input_per_m}/${output_per_m} per M, {n} completed runs)")


def main() -> int:
    for run_set, (input_per_m, output_per_m, note) in CORRECTIONS.items():
        apply_correction(run_set, input_per_m, output_per_m, note)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
