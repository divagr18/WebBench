"""Stage one freshly scored model into the dashboard for `?export` images."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "analysis" / "model_comparison_dashboard.html"


def match_close(text: str, start: int) -> int:
    opening = text[start]
    closing = "}" if opening == "{" else "]"
    depth, quote, i = 0, None, start
    while i < len(text):
        char = text[i]
        if quote:
            if char == "\\":
                i += 2
                continue
            if char == quote:
                quote = None
        elif char in "\"'":
            quote = char
        elif char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("unmatched bracket")


def dashboard_entry(score: dict, runs_csv: Path) -> dict:
    conditions = {
        item["condition"]: {
            "acc": item["accuracy"]["value"],
            "correct": item["correct"],
            "total": item["total"],
            "ci": item["accuracy"]["ci95"],
        }
        for item in score["conditionAccuracy"]
    }
    corruptions: list[str] = []
    with runs_csv.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row["status"] == "completed" and row["priorCorrect"] == "true" and row["finalCorrect"] == "false":
                corruptions.append(row["episodeId"])
    return {
        "runSet": score["runSetId"], "eas": score["eas"],
        "easCi": score["bootstrap"]["eas"]["ci95"],
        **{key: score[key]["value"] for key in ("fbar", "cur", "pcr", "prr")},
        **{key + suffix: score[key][field] for key in ("fbar", "cur", "pcr", "prr") for suffix, field in (("N", "numerator"), ("D", "denominator"))},
        "ser": score["ser"]["value"], "psr": score["psr"]["value"],
        "ci": score["ci"]["value"], "tua": score["tua"]["value"],
        "ics": score["ics"]["meanPairedDiff"],
        "brier": score["calibration"]["brier"], "ece": score["calibration"]["ece"],
        "bins": score["calibration"]["bins"], "conditions": conditions,
        "cost": score["cost"]["totalCostUsd"],
        "avgToolCalls": score["cost"]["meanToolCalls"],
        "latency": round(score["cost"]["meanLatencyMs"] / 1000, 2),
        "corruptions": sorted(corruptions),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-key", required=True)
    parser.add_argument("--score-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    score = json.loads(args.score_report.read_text(encoding="utf-8"))
    html = DASHBOARD.read_text(encoding="utf-8")
    start = html.index("const DATA = {")
    opening = html.index("{", start)
    closing = match_close(html, opening)
    data = json.loads(html[opening : closing + 1])
    if args.model_key not in data:
        raise KeyError(f"dashboard has no model key: {args.model_key}")
    data[args.model_key] = dashboard_entry(score, args.score_report.with_name("runs.csv"))
    args.output.write_text(html[:start] + "const DATA = " + json.dumps(data, indent=2) + html[closing + 1:], encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
