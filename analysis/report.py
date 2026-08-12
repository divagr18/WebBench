"""EchoBench analysis: tables + paper figures from a score report.

Reads score-report.json (+ optional runs.csv next to it) and writes:
  tables/conditions.csv, tables/metrics.md
  fig_cost_eas.svg, fig_condition_accuracy.svg, fig_calibration.svg, fig_ics_pairs.svg
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("SOURCE_DATE_EPOCH", "1767225600")

import matplotlib

matplotlib.use("Agg")
matplotlib.rcParams["svg.hashsalt"] = "echobench"
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

CONDITION_ORDER = [
    "clean",
    "single_poison",
    "ranked_poison",
    "manufactured_consensus",
    "legitimate_update",
    "false_majority_true_primary",
]


def load_score(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf8"))


def write_conditions_table(score: dict, out_dir: Path) -> None:
    rows = score.get("conditionAccuracy", [])
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.set_index("condition").reindex([c for c in CONDITION_ORDER if c in df.index]).reset_index()
        df["accuracy_value"] = df["accuracy"].map(lambda a: a.get("value") if isinstance(a, dict) else None)
    out_dir.joinpath("tables", "conditions.csv").write_text(df.to_csv(index=False), encoding="utf8")


def write_metrics_md(score: dict, out_dir: Path) -> None:
    metric_names = ["fbar", "cur", "pcr", "ser", "psr", "ci", "tua"]
    lines = ["# EchoBench metrics", "", "| Metric | Value | N | D |", "|---|---|---|---|"]
    for name in metric_names:
        m = score.get(name) or {}
        value = m.get("value")
        lines.append(f"| {name} | {value:.4f} | {m.get('numerator', '-')} | {m.get('denominator', '-')} |" if isinstance(value, (int, float)) else f"| {name} | n/a | {m.get('numerator', 0)} | {m.get('denominator', 0)} |")
    eas = score.get("eas")
    lines.append(f"| eas | {eas:.4f} | - | - |" if isinstance(eas, (int, float)) else "| eas | n/a | - | - |")
    ics = score.get("ics") or {}
    diff = ics.get("meanPairedDiff")
    lines.append(f"| ics | {diff:.4f} | pairs={ics.get('pairs', 0)} | - |" if isinstance(diff, (int, float)) else "| ics | n/a | 0 | - |")
    out_dir.joinpath("tables", "metrics.md").write_text("\n".join(lines) + "\n", encoding="utf8")


def fig_condition_accuracy(score: dict, out_dir: Path) -> None:
    rows = score.get("conditionAccuracy", [])
    labels, values, counts = [], [], []
    for row in rows:
        acc = row.get("accuracy") or {}
        labels.append(row.get("condition", "?"))
        values.append(acc.get("value") if acc.get("value") is not None else 0.0)
        counts.append(row.get("total", 0))
    if not labels:
        return
    order = [i for c in CONDITION_ORDER for i, l in enumerate(labels) if l == c]
    labels = [labels[i] for i in order]
    values = [values[i] for i in order]
    counts = [counts[i] for i in order]
    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(labels, values, color="#3b82f6")
    for bar, n in zip(bars, counts):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01, f"n={n}", ha="center", fontsize=8)
    ax.set_ylim(0, 1.1)
    ax.set_ylabel("accuracy (final answer correct)")
    ax.set_title("EchoBench accuracy by evidence condition")
    plt.setp(ax.get_xticklabels(), rotation=20, ha="right")
    fig.tight_layout()
    fig.savefig(out_dir.joinpath("fig_condition_accuracy.svg"))
    plt.close(fig)


def fig_calibration(score: dict, out_dir: Path) -> None:
    cal = score.get("calibration") or {}
    bins = cal.get("bins") or []
    if not bins:
        return
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.plot([0, 1], [0, 1], color="#9ca3af", linestyle="--", label="perfect calibration")
    xs = [b["avgConfidence"] for b in bins]
    ys = [b["accuracy"] for b in bins]
    sizes = [max(20, b["count"] * 4) for b in bins]
    ax.scatter(xs, ys, s=sizes, color="#ef4444", alpha=0.8)
    ax.set_xlabel("mean predicted confidence")
    ax.set_ylabel("empirical accuracy")
    brier = cal.get("brier")
    ece = cal.get("ece")
    ax.set_title(f"Reliability diagram (Brier={brier:.3f}, ECE={ece:.3f})" if isinstance(brier, (int, float)) and isinstance(ece, (int, float)) else "Reliability diagram")
    ax.legend()
    fig.tight_layout()
    fig.savefig(out_dir.joinpath("fig_calibration.svg"))
    plt.close(fig)


def fig_ics_pairs(score: dict, out_dir: Path) -> None:
    ics = score.get("ics") or {}
    pairs = ics.get("perClaim") or []
    if not pairs:
        return
    clean = [p["cleanConfidence"] for p in pairs]
    echo = [p["echoConfidence"] for p in pairs]
    fig, ax = plt.subplots(figsize=(5, 5))
    lims = [0, 1]
    ax.plot(lims, lims, color="#9ca3af", linestyle="--")
    ax.scatter(clean, echo, color="#10b981")
    ax.set_xlabel("confidence in clean (independent corroboration) world")
    ax.set_ylabel("confidence in echo (manufactured consensus) world")
    diff = ics.get("meanPairedDiff")
    ax.set_title(f"ICS paired confidence (mean diff = {diff:.3f})" if isinstance(diff, (int, float)) else "ICS paired confidence")
    fig.tight_layout()
    fig.savefig(out_dir.joinpath("fig_ics_pairs.svg"))
    plt.close(fig)


def fig_cost_eas(score_path: Path, out_dir: Path) -> None:
    points = []
    for candidate in sorted(score_path.parent.parent.glob("*/score-report.json")):
        try:
            data = json.loads(candidate.read_text(encoding="utf8"))
        except (OSError, json.JSONDecodeError):
            continue
        eas = data.get("eas")
        cost = (data.get("cost") or {}).get("meanCostUsd")
        if isinstance(eas, (int, float)) and isinstance(cost, (int, float)):
            points.append((cost, eas, data.get("runSetId", candidate.parent.name), data.get("modelRequested", "")))
    if not points:
        return
    fig, ax = plt.subplots(figsize=(6, 4))
    for cost, eas, run_set, model in points:
        ax.scatter(cost, eas, color="#6366f1")
        ax.annotate(f"{run_set}\n({model})", (cost, eas), textcoords="offset points", xytext=(6, 4), fontsize=7)
    ax.set_xlabel("mean estimated cost per run (USD)")
    ax.set_ylabel("Epistemic Arbitration Score")
    ax.set_title("Cost vs epistemic arbitration")
    fig.tight_layout()
    fig.savefig(out_dir.joinpath("fig_cost_eas.svg"))
    plt.close(fig)


def main() -> int:
    parser = argparse.ArgumentParser(description="EchoBench analysis")
    parser.add_argument("--score", required=True, help="path to score-report.json")
    parser.add_argument("--out", required=True, help="output directory")
    args = parser.parse_args()

    score_path = Path(args.score).resolve()
    out_dir = Path(args.out).resolve()
    out_dir.joinpath("tables").mkdir(parents=True, exist_ok=True)

    score = load_score(score_path)
    write_conditions_table(score, out_dir)
    write_metrics_md(score, out_dir)
    fig_condition_accuracy(score, out_dir)
    fig_calibration(score, out_dir)
    fig_ics_pairs(score, out_dir)
    fig_cost_eas(score_path, out_dir)
    print(f"[analysis] wrote tables + figures to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
