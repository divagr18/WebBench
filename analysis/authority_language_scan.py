"""Limited process-level construct-validity pilot (Thorough Reviewer 1,
concern #2): does a model's stated reasoning cite copy-relations/provenance,
or just an official-sounding label?

SCOPE NOTE: this is a single-model, n<=50 proof-of-concept, not a field-wide
finding. Raw trace files (with the free-text finalJudgment.conclusion field
this needs) currently exist on local disk only for GLM 5.2's canonical run
set (dev-glm52-gmicloud-pinned-low-20260821) -- the traces backing
DeepSeek/Qwen/Luna's committed reports/dev/pilot-dev-v2* score reports are
not present locally, only their aggregated CSV/JSON outputs are. Do not fold
this into any headline claim; report it explicitly as exploratory discussion-
section evidence from one model, pending trace availability for the rest of
the field.

Scans finalJudgment.conclusion text for authority-cue vs. provenance-cue
language, cross-tabbed by condition and correctness (from the matching
runs.csv row, so we don't reimplement isCorrect() here).
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TRACE_DIR = REPO / "traces" / "dev" / "dev-glm52-gmicloud-pinned-low-20260821"
RUNS_CSV = REPO / "reports" / "dev" / "dev-glm52-gmicloud-pinned-low-20260821" / "runs.csv"
OUT = Path(__file__).resolve().parent / "authority_language_scan.md"

AUTHORITY_CUES = {
    "official/officially": r"\bofficial(?:ly)?\b",
    "authoritative": r"\bauthoritative\b",
    "verified": r"\bverified\b",
    "government": r"\bgovernment\b",
    "registry": r"\bregistry\b",
}
PROVENANCE_CUES = {
    "same source": r"\bsame source\b",
    "copied": r"\bcopied\b",
    "reposted": r"\breposted?\b",
    "one origin": r"\bone origin\b",
    "shared origin": r"\bshared origin\b",
    "echo(ed)": r"\becho(?:ed|o)?\b",
    "duplicate(d/s)": r"\bduplicate[ds]?\b",
    "independent source/report/corroborate": r"\bindependent(?:ly)? (?:source|report|corroborat)",
    "same claim/post/thread": r"\bsame (?:claim|post|thread)\b",
    "traces back": r"\btrace[sd]? back\b",
}


def load_runs_csv() -> dict:
    out = {}
    with RUNS_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[row["episodeId"]] = row
    return out


def count_cues(text: str, cues: dict) -> int:
    text_low = text.lower()
    return sum(1 for p in cues.values() if re.search(p, text_low))


def main() -> int:
    if not TRACE_DIR.is_dir():
        print(f"[authority_language_scan] trace dir not found: {TRACE_DIR} -- nothing to scan")
        return 1
    runs = load_runs_csv()

    rows = []
    for f in sorted(TRACE_DIR.glob("*.jsonl")):
        if f.name == "index.jsonl":
            continue
        trace = None
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            obj = json.loads(line)
            if obj.get("type") == "episode_trace":
                trace = obj["trace"]
        if not trace or not trace.get("finalJudgment"):
            continue
        conclusion = trace["finalJudgment"].get("conclusion") or ""
        episode_id = trace["episodeId"]
        run_row = runs.get(episode_id)
        if not run_row or run_row["status"] != "completed":
            continue
        condition = episode_id.split("__", 1)[1] if "__" in episode_id else "unknown"
        rows.append({
            "episodeId": episode_id,
            "condition": condition,
            "finalCorrect": run_row["finalCorrect"] == "true",
            "authorityCues": count_cues(conclusion, AUTHORITY_CUES),
            "provenanceCues": count_cues(conclusion, PROVENANCE_CUES),
        })

    by_condition = defaultdict(list)
    for r in rows:
        by_condition[r["condition"]].append(r)

    lines = [
        "# Authority-cue vs. provenance-cue language scan (pilot, GLM 5.2 only)",
        "",
        "**SCOPE: single-model (GLM 5.2), n<={} completed runs, canonical dev run set "
        "`dev-glm52-gmicloud-pinned-low-20260821`. This is an exploratory proof-of-concept, "
        "not a field-wide finding — raw trace text is only locally available for this one "
        "model right now. Do not cite this as validating or refuting the arbitration "
        "construct for the field.**".format(len(rows)),
        "",
        f"Scanned {len(rows)} completed runs' `finalJudgment.conclusion` text for authority-cue "
        f"terms ({', '.join(AUTHORITY_CUES)}) vs. provenance-cue terms "
        f"({', '.join(PROVENANCE_CUES)}).",
        "",
        "| Condition | n | mean authority-cue hits | mean provenance-cue hits | "
        "mean auth. hits (correct) | mean auth. hits (incorrect) | "
        "mean prov. hits (correct) | mean prov. hits (incorrect) |",
        "|---|---|---|---|---|---|---|---|",
    ]

    def mean(xs):
        return sum(xs) / len(xs) if xs else float("nan")

    for cond in sorted(by_condition):
        group = by_condition[cond]
        correct = [r for r in group if r["finalCorrect"]]
        incorrect = [r for r in group if not r["finalCorrect"]]
        lines.append(
            f"| {cond} | {len(group)} "
            f"| {mean([r['authorityCues'] for r in group]):.2f} "
            f"| {mean([r['provenanceCues'] for r in group]):.2f} "
            f"| {mean([r['authorityCues'] for r in correct]):.2f} "
            f"| {mean([r['authorityCues'] for r in incorrect]):.2f} "
            f"| {mean([r['provenanceCues'] for r in correct]):.2f} "
            f"| {mean([r['provenanceCues'] for r in incorrect]):.2f} |"
        )

    lines.append("")
    lines.append(
        "Interpretation caveat: a raw keyword count is a weak proxy for *why* the model "
        "reached its conclusion -- it does not distinguish citing provenance as the reason "
        "for a decision from mentioning it in passing. Treat as a discussion-section pointer "
        "toward what a real process-level validation (independent human coding of "
        "reasoning traces) would need to check, not as that validation itself."
    )

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(rows)} runs scanned)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
