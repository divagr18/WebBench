"""Regenerate the cross-model dashboard data for all finished pilots.

Rewrites `data_model_comparison.json` and splices the refreshed DATA/MODELS
blocks into `model_comparison_dashboard.html` so the dashboard reflects the
full 11-model field.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
REPORTS = REPO / "reports" / "dev"
OUT = Path(__file__).resolve().parent
HTML = OUT / "model_comparison_dashboard.html"

COND_ORDER = [
    "clean",
    "single_poison",
    "ranked_poison",
    "manufactured_consensus",
    "legitimate_update",
    "false_majority_true_primary",
]

# (runset, modelId, name, short, color, logo)  — finished pilots only
# Colors from the Tableau-10 categorical palette for maximal separation.
PILOTS = [
    ("pilot-dev-v2", "deepseek-chat", "DeepSeek V4 Flash", "V4 Flash", "#4E79A7", "deepseek"),
    ("pilot-dev-v2-openai", "gpt-5.6-luna", "Luna", "Luna", "#E15759", "openai"),
    ("pilot-dev-v2-modelscope-max", "qwen3.7-max", "Qwen3.7 Max", "Qwen Max", "#F28E2B", "qwen"),
    ("pilot-dev-v2-modelscope-plus", "qwen3.7-plus", "Qwen3.7 Plus", "Qwen Plus", "#B07AA1", "qwen"),
    ("pilot-gemini-37", "gemini-3.7-fl", "Gemini 3.7 Flash", "Gem 3.7", "#76B7B2", "openai"),
    ("pilot-gemini-35-lite", "gemini-3.5-lite", "Gemini 3.5 Flash-Lite", "Gem 3.5L", "#EDC948", "openai"),
    ("pilot-terra-80", "gpt-5.6-terra", "Terra", "Terra", "#59A14F", "openai"),
    ("pilot-muse-80", "muse", "Muse Spark 1.2", "Muse", "#FF9DA7", "deepseek"),
    ("pilot-grok-80", "grok", "Grok 4.6", "Grok", "#9C755F", "deepseek"),
    ("pilot-sol-50", "gpt-5.6-sol", "GPT-5.6 Sol", "Sol", "#BAB0AC", "openai"),
]


def build_entry(runset: str) -> dict:
    score = json.loads((REPORTS / runset / "score-report.json").read_text(encoding="utf8"))
    entry: dict = {"runSet": runset}
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
            "ci": list(c["accuracy"]["ci95"]),
        }
    entry["conditions"] = {k: conds.get(k, {"acc": 0, "correct": 0, "total": 0, "ci": [0, 0]}) for k in COND_ORDER}
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
