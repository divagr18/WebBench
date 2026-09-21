"""Regenerate the cross-model dashboard data for all available run sets.

Rewrites `data_model_comparison.json` and splices the refreshed DATA/MODELS
blocks into `model_comparison_dashboard.html`.

Model list comes from `paper/run_manifest.json` (every `status: "available"`
entry, any role) instead of a hand-maintained list here -- this was
previously the one script the manifest migration missed: `paper/
gen_paper_data.py` moved to the manifest, this one didn't, and it still had
a stale plain "Luna" entry that didn't distinguish the effort-appendix role
from the (still-missing) field entry.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
REPORTS = REPO / "reports" / "dev"
OUT = Path(__file__).resolve().parent
HTML = OUT / "model_comparison_dashboard.html"

sys.path.insert(0, str(REPO / "paper"))
from validate_manifest import load_manifest, report_files_present  # noqa: E402

COND_ORDER = [
    "clean",
    "single_poison",
    "ranked_poison",
    "manufactured_consensus",
    "legitimate_update",
    "false_majority_true_primary",
    "authority_inverted_consensus",
    "independent_false_majority",
]

# Tableau-10 categorical palette, cycled by manifest order -- colors are a
# display concern only, not part of the manifest's job.
_PALETTE = ["#4E79A7", "#E15759", "#F28E2B", "#B07AA1", "#76B7B2", "#EDC948",
            "#59A14F", "#FF9DA7", "#9C755F", "#BAB0AC", "#2563A8", "#8C564B"]
_LOGOS = {"deepseek", "openai", "qwen", "glm", "nemotron", "inkling"}

# Substring -> logo bucket, checked in order (first match wins). "glm" must be
# checked before "deepseek" would ever be reachable by accident, and every
# entry needs its own bucket now that the dashboard has real icons for them --
# previously glm fell into the deepseek bucket and inkling/nemotron fell
# through to the openai default, all silently wrong.
_LOGO_RULES = [
    ("glm", "glm"),
    ("deepseek", "deepseek"),
    ("qwen", "qwen"),
    ("nemotron", "nemotron"),
    ("inkling", "inkling"),
]


def _logo_for(model_id: str) -> str:
    lower = model_id.lower()
    for needle, logo in _LOGO_RULES:
        if needle in lower:
            return logo
    return "openai"  # true fallback: OpenAI models, and any genuinely new/unmapped model


def load_pilots() -> list[tuple[str, str, str, str, str, str]]:
    """(runset, modelId, displayName, short, color, logo) for every available manifest entry."""
    manifest = load_manifest()
    pilots = []
    for i, m in enumerate(manifest["models"]):
        if m["status"] != "available":
            continue
        color = _PALETTE[i % len(_PALETTE)]
        logo = _logo_for(m["modelId"])
        short = m["displayName"].replace("GPT-5.6 ", "").replace(" Spark 1.2", " Spark")
        pilots.append((m["runSet"], m["modelId"], m["displayName"], short, color, logo))
    return pilots


PILOTS = load_pilots()


def build_entry(runset: str) -> dict:
    score = json.loads((REPORTS / runset / "score-report.json").read_text(encoding="utf8"))
    entry: dict = {"runSet": runset}
    entry["totalRuns"] = score["totalRuns"]
    entry["completedRuns"] = score["completedRuns"]
    entry["rejectedRuns"] = score["rejectedRuns"]
    entry["eas"] = score["eas"]
    entry["easCi"] = score["bootstrap"]["eas"]["ci95"]
    for k in ("fbar", "cur", "pcr", "prr"):
        m = score[k]
        entry[k] = m["value"]
        entry[k + "N"] = m["numerator"]
        entry[k + "D"] = m["denominator"]
    entry["ser"] = score["ser"]["value"]
    entry["psr"] = score["psr"]["value"]
    entry["ci"] = score["ci"]["value"]
    entry["tua"] = score["tua"]["value"]
    entry["ics"] = score["ics"]["meanPairedDiff"]
    cal = score["calibration"]
    entry["brier"] = cal["brier"]
    entry["ece"] = cal["ece"]
    entry["bins"] = [
        {
            "bin": b["bin"],
            "count": b["count"],
            "avgConfidence": b["avgConfidence"],
            "accuracy": b["accuracy"],
        }
        for b in cal["bins"]
    ]
    conds = {}
    for c in score["conditionAccuracy"]:
        conds[c["condition"]] = {
            "acc": c["accuracy"]["value"],
            "correct": c["correct"],
            "total": c["total"],
            "ci": list(c["accuracy"]["ci95"]) if c["accuracy"].get("ci95") else [0, 0],
            "rejected": c.get("rejected", 0),
            "failed": c.get("failed", 0),
        }
    entry["conditions"] = {
        k: conds.get(k, {"acc": 0, "correct": 0, "total": 0, "ci": [0, 0], "rejected": 0, "failed": 0})
        for k in COND_ORDER
    }
    entry["authorityAblation"] = score.get("authorityAblation")
    entry["itt"] = score.get("itt")
    cost = score["cost"]
    total_runs = score["totalRuns"]
    # Muse ran on the contributor (training-opt-in) tier; surface OFFICIAL standard pricing
    runset_is_muse = runset == "pilot-muse-80"
    if runset_is_muse:
        per_run = (cost["meanInputTokens"] / 1e6) * 1.25 + (cost["meanOutputTokens"] / 1e6) * 4.25
        entry["cost"] = round(per_run * total_runs, 4)
        entry["officialNote"] = "official standard-tier pricing"
    else:
        entry["cost"] = cost["totalCostUsd"]
    entry["avgToolCalls"] = cost.get("meanToolCalls", 0)
    entry["latency"] = round(cost.get("meanLatencyMs", 0) / 1000.0, 2)
    # corruptions: prior correct -> final wrong
    cors = []
    try:
        with (REPORTS / runset / "runs.csv").open(newline="", encoding="utf8") as f:
            for row in csv.DictReader(f):
                if row["status"] == "completed" and row["priorCorrect"] == "true" and row["finalCorrect"] == "false":
                    cors.append(row["episodeId"])
    except FileNotFoundError:
        pass
    entry["corruptions"] = sorted(cors)
    return entry


def main() -> int:
    data = {model_id: build_entry(runset) for runset, model_id, *_ in PILOTS}

    # refresh the standalone JSON (models keyed by id), keep a friendly ordering
    (OUT / "data_model_comparison.json").write_text(
        json.dumps(data, indent=2), encoding="utf8"
    )

    html = HTML.read_text(encoding="utf8")

    # ---- splice DATA ----
    start = html.index("const DATA = {")
    end = _match_close(html, html.index("{", start))
    new_data = "const DATA = " + json.dumps(data, indent=2)
    html = html[:start] + new_data + html[end + 1:]

    # ---- splice MODELS ----
    ms = html.index("const MODELS = [")
    me = _match_close(html, html.index("[", ms))
    lines = []
    for runset, model_id, name, short, color, logo in PILOTS:
        lines.append(
            f"  {{ key: '{model_id}', name: '{name}', short: '{short}', color: '{color}', logo: LOGOS.{logo} }}"
        )
    new_models = "const MODELS = [\n" + ",\n".join(lines) + "\n]"
    html = html[:ms] + new_models + html[me + 1:]

    HTML.write_text(html, encoding="utf8")
    print(f"refreshed DATA ({len(data)} models) + MODELS in {HTML.name}")
    return 0


def _match_close(text: str, open_idx: int) -> int:
    """Return index of the brace/bracket matching the one at open_idx."""
    open_c = text[open_idx]
    close_c = "}" if open_c == "{" else "]"
    depth = 0
    i = open_idx
    in_str = None
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == in_str:
                in_str = None
        else:
            if ch in "\"'":
                in_str = ch
            elif ch == open_c:
                depth += 1
            elif ch == close_c:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    raise ValueError("unmatched bracket")


if __name__ == "__main__":
    raise SystemExit(main())
