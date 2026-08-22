"""Cross-model paired analysis restricted to the paper's 10-field configurations.

Mirrors analysis/cross_model_analysis.py but drops the Luna no-reasoning pilot,
so shared-episode counts, pairwise CIs, and world difficulty match the field.
"""
import csv
import json
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[1]
REPORTS = REPO / "reports" / "dev"

FIELD = [
    ("pilot-dev-v2", "DeepSeek V4 Flash"),
    ("pilot-dev-v2-openai-low", "GPT-5.6 Luna"),
    ("pilot-dev-v2-modelscope-max", "Qwen3.7 Max"),
    ("pilot-dev-v2-modelscope-plus", "Qwen3.7 Plus"),
    ("pilot-gemini-37", "Gemini 3.7 Flash"),
    ("pilot-gemini-35-lite", "Gemini 3.5 Flash-Lite"),
    ("pilot-terra-80", "GPT-5.6 Terra"),
    ("pilot-muse-80", "Muse Spark 1.2"),
    ("pilot-grok-80", "Grok 4.6"),
    ("pilot-sol-50", "GPT-5.6 Sol"),
]
N_BOOT = 2000
SEED = 42


def load_runs(runset):
    out = {}
    with (REPORTS / runset / "runs.csv").open(newline="", encoding="utf8") as f:
        for row in csv.DictReader(f):
            if row["status"] != "completed":
                continue
            ep = row["episodeId"]
            claim_id, cond = ep.split("__", 1)
            out[ep] = {
                "finalCorrect": row["finalCorrect"] == "true",
                "priorCorrect": row["priorCorrect"] == "true",
                "condition": cond,
            }
    return out


def paired_bootstrap(a, b):
    d = a.astype(float) - b.astype(float)
    n = len(d)
    rng = np.random.default_rng(SEED)
    idx = rng.integers(0, n, size=(N_BOOT, n))
    diffs = d[idx].mean(axis=1)
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    return float(d.mean()), float(lo), float(hi)


def main():
    data = {}
    for runset, name in FIELD:
        data[name] = load_runs(runset)
    scores = {
        name: json.loads((REPORTS / runset / "score-report.json").read_text(encoding="utf8"))
        for runset, name in FIELD
    }

    eps = {name: set(d) for name, d in data.items()}
    common = set.intersection(*eps.values())
    names = [n for _r, n in FIELD]
    n_models = len(names)
    print("field models:", n_models)
    print("common episodes:", len(common))

    acc = {n: np.mean([data[n][ep]["finalCorrect"] for ep in common]) for n in names}
    rank = sorted(names, key=lambda n: -acc[n])
    print("\nper-model accuracy on common set:")
    for n in rank:
        print(f"  {n}: {acc[n]:.3f}")

    lines = []
    lines.append("# Cross-model analysis, paper field (10 configurations)\n")
    lines.append(
        f"Models: {n_models}. Common episodes (intersection of all pilots): "
        f"{len(common)}. Paired tests bootstrap n={N_BOOT} on the shared set.\n"
    )

    lines.append("## 1. Paired accuracy differences (A - B, on common episodes)")
    lines.append("Only shown for adjacent/nearby ranks; CI excluding 0 = significant.\n")
    lines.append("| A | B | A acc | B acc | diff | 95% CI | sig |")
    lines.append("|---|---|---|---|---|---|---|")
    for i, ka in enumerate(rank):
        for kb in rank[i + 1:]:
            common_pair = sorted(eps[ka] & eps[kb])
            a = np.array([data[ka][ep]["finalCorrect"] for ep in common_pair], float)
            b = np.array([data[kb][ep]["finalCorrect"] for ep in common_pair], float)
            diff, lo, hi = paired_bootstrap(a, b)
            sig = "**yes**" if (lo > 0 or hi < 0) else "no"
            lines.append(
                f"| {ka} | {kb} | {a.mean():.3f} | {b.mean():.3f} | "
                f"{diff:+.3f} | [{lo:+.3f}, {hi:+.3f}] | {sig} |"
            )
    lines.append("")

    leader = rank[0]
    print(f"\npaired diffs vs {leader}:")
    for n in names:
        if n == leader:
            continue
        common_pair = sorted(eps[leader] & eps[n])
        a = np.array([data[leader][ep]["finalCorrect"] for ep in common_pair], float)
        b = np.array([data[n][ep]["finalCorrect"] for ep in common_pair], float)
        diff, lo, hi = paired_bootstrap(a, b)
        sig = lo > 0 or hi < 0
        print(f"  {n}: {diff:+.3f} [{lo:+.3f}, {hi:+.3f}] {'SIG' if sig else 'ns'}")

    lines.append("## 2. World difficulty & cross-model agreement")
    counts = {}
    for ep in common:
        counts[ep] = sum(1 for n in names if data[n][ep]["finalCorrect"])
    lines.append(f"\nEpisodes by #models-correct (of {n_models}):")
    hist = {v: 0 for v in range(n_models + 1)}
    for c in counts.values():
        hist[c] += 1
    lines.append("| #models correct | episodes |")
    lines.append("|---|---|")
    for v in sorted(hist, reverse=True):
        lines.append(f"| {v}/{n_models} | {hist[v]} |")
    hardest = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]))[:15]
    lines.append("\nHardest worlds (fewest models correct):")
    lines.append("| episode | models correct | condition |")
    lines.append("|---|---|---|")
    for ep, c in hardest:
        cond = data[names[0]][ep]["condition"]
        lines.append(f"| {ep} | {c}/{n_models} | {cond} |")
    all_correct = sum(1 for c in counts.values() if c == n_models)
    none_right = sum(1 for c in counts.values() if c == 0)
    lines.append(f"\nAll-models-correct: {all_correct} | No-model-correct: {none_right}")
    print(f"\nall-models-correct: {all_correct}, none-correct: {none_right}")

    lines.append("\n## 3. Failure taxonomy (per model, per-episode prior/final)")
    lines.append("| Model | Rescued | Corruption | Stuck-wrong | Correct-stable | PRR |")
    lines.append("|---|---|---|---|---|---|")
    for n in names:
        res = corr = stuck = stable = 0
        for r in data[n].values():
            p, f = r["priorCorrect"], r["finalCorrect"]
            if p and f:
                stable += 1
            elif p and not f:
                corr += 1
            elif not p and f:
                res += 1
            else:
                stuck += 1
        prr = scores[n]["prr"]["value"]
        lines.append(f"| {n} | {res} | {corr} | {stuck} | {stable} | {prr:.3f} |")

    fm = "false_majority_true_primary"
    lines.append(f"\nCorruption on `{fm}` (prior correct -> final wrong):")
    lines.append("| Model | corrupted / had-correct-prior |")
    lines.append("|---|---|")
    for n in names:
        had = [ep for ep, r in data[n].items() if r["condition"] == fm and r["priorCorrect"]]
        bad = [ep for ep in had if not data[n][ep]["finalCorrect"]]
        lines.append(f"| {n} | {len(bad)}/{len(had)} |")

    lines.append("\n## 4. Confidence calibration & discrimination")
    lines.append("(AUC = confidence's ability to separate correct from wrong; Brier lower better)\n")
    from sklearn.metrics import roc_auc_score, brier_score_loss

    lines.append("| Model | AUC | Brier | ECE | mean conf | accuracy |")
    lines.append("|---|---|---|---|---|---|")
    for runset, n in FIELD:
        y, c = [], []
        with (REPORTS / runset / "runs.csv").open(newline="", encoding="utf8") as f:
            for row in csv.DictReader(f):
                if row["status"] != "completed":
                    continue
                y.append(1 if row["finalCorrect"] == "true" else 0)
                c.append(float(row["confidence"]))
        y = np.array(y, int)
        c = np.array(c, float)
        auc = roc_auc_score(y, c) if len(np.unique(y)) > 1 else float("nan")
        brier = brier_score_loss(y, c)
        ece = scores[n]["calibration"]["ece"]
        lines.append(f"| {n} | {auc:.3f} | {brier:.3f} | {ece:.3f} | {c.mean():.3f} | {y.mean():.3f} |")
        print(f"  {n}: AUC {auc:.3f}")

    out = Path(__file__).resolve().parent / "cross_field_report.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
