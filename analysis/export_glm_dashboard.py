"""Stage a GLM 5.2 (OpenRouter, n=100) variant of the dashboard for the
browser export route.

The rendered page is deliberately the normal dashboard with only one extra
model datum/row.  This keeps `?export=N` sizing and card CSS identical to the
existing PNG exports.

The GLM report directory comes from `paper/run_manifest.json`'s
`glm-5.2-openrouter-100` entry instead of being hardcoded here, and there is
no more fallback to a `tmp/paper-source-glm/paper_data.json` path -- that
path never existed on disk (confirmed) and was dead code.
"""
from __future__ import annotations

import json
import csv
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "analysis" / "model_comparison_dashboard.html"
STAGED = ROOT / "tmp" / "model-comparison-dashboard-glm.html"

sys.path.insert(0, str(ROOT / "paper"))
from validate_manifest import load_manifest, report_dir  # noqa: E402

_MANIFEST_ENTRY = next(m for m in load_manifest()["models"] if m["modelId"] == "glm-5.2-openrouter-100")
SCORE_REPORT = report_dir(_MANIFEST_ENTRY["runSet"]) / "score-report.json"
RUNS_CSV = SCORE_REPORT.with_name("runs.csv")


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


def replace_block(text: str, marker: str, replacement: str) -> str:
    marker_start = text.index(marker)
    opening_start = text.index("{" if marker.endswith("{") else "[", marker_start)
    closing = match_close(text, opening_start)
    return text[:marker_start] + replacement + text[closing + 1:]


def main() -> None:
    html = DASHBOARD.read_text(encoding="utf-8")
    glm = fresh_glm_entry()

    data_start = html.index("const DATA = {")
    data_open = html.index("{", data_start)
    data_close = match_close(html, data_open)
    data = json.loads(html[data_open : data_close + 1])
    # A distinct key from the canonical "glm-5.2" entry gen_dashboard_data.py already
    # writes (50-run/0%-rejected) -- this is the separate 100-run/24%-rejected OpenRouter
    # sensitivity variant; overwriting "glm-5.2" here would silently replace the
    # canonical entry with the higher-n, higher-rejection-rate one.
    data["glm-5.2-openrouter-100"] = glm
    html = html[:data_start] + "const DATA = " + json.dumps(data, indent=2) + html[data_close + 1:]

    models_start = html.index("const MODELS = [")
    models_open = html.index("[", models_start)
    models_close = match_close(html, models_open)
    models = html[models_open + 1 : models_close].rstrip()
    glm_model = "  { key: 'glm-5.2-openrouter-100', name: 'GLM 5.2 (OpenRouter, n=100)', short: 'GLM 100', color: '#2563A8', logo: LOGOS.openai }"
    if models:
        models += ",\n"
    models += glm_model + "\n"
    html = html[:models_start] + "const MODELS = [\n" + models + "]" + html[models_close + 1:]

    STAGED.parent.mkdir(parents=True, exist_ok=True)
    STAGED.write_text(html, encoding="utf-8")
    print(STAGED)


def fresh_glm_entry() -> dict:
    """Turn the scored Streamlake run into the dashboard's compact schema."""
    if not SCORE_REPORT.exists():
        raise FileNotFoundError(
            f"manifest entry glm-5.2-openrouter-100 points at {SCORE_REPORT}, "
            f"which does not exist -- update run_manifest.json's runSet or status"
        )
    score = json.loads(SCORE_REPORT.read_text(encoding="utf-8"))
    conditions = {
        condition["condition"]: {
            "acc": condition["accuracy"]["value"],
            "correct": condition["correct"],
            "total": condition["total"],
            "ci": condition["accuracy"]["ci95"],
        }
        for condition in score["conditionAccuracy"]
    }
    corruptions: list[str] = []
    if RUNS_CSV.exists():
        with RUNS_CSV.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                if row["status"] == "completed" and row["priorCorrect"] == "true" and row["finalCorrect"] == "false":
                    corruptions.append(row["episodeId"])
    return {
        "runSet": score["runSetId"],
        "eas": score["eas"],
        "easCi": score["bootstrap"]["eas"]["ci95"],
        **{
            key: score[key]["value"]
            for key in ("fbar", "cur", "pcr", "prr")
        },
        **{
            key + suffix: score[key][field]
            for key in ("fbar", "cur", "pcr", "prr")
            for suffix, field in (("N", "numerator"), ("D", "denominator"))
        },
        "ser": score["ser"]["value"],
        "psr": score["psr"]["value"],
        "ci": score["ci"]["value"],
        "tua": score["tua"]["value"],
        "ics": score["ics"]["meanPairedDiff"],
        "brier": score["calibration"]["brier"],
        "ece": score["calibration"]["ece"],
        "bins": score["calibration"]["bins"],
        "conditions": conditions,
        "cost": score["cost"]["totalCostUsd"],
        "avgToolCalls": score["cost"]["meanToolCalls"],
        "latency": round(score["cost"]["meanLatencyMs"] / 1000, 2),
        "corruptions": sorted(corruptions),
    }


if __name__ == "__main__":
    main()
