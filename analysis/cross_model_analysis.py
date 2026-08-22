"""Cross-model comparative analysis over the completed EchoBench dev pilots.

Reads per-episode runs.csv + score-report.json for each finished pilot and
produces: paired significance testing, world-difficulty / cross-model agreement,
a failure taxonomy, and confidence calibration + discrimination (AUC/Brier).

All models answered the same plan-seed episodes, so pairwise tests are PAIRED
on the shared episode set (far stronger than independent CIs).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[1]
REPORTS = REPO / "reports" / "dev"
OUT = REPO / "analysis"
EXPORTS = OUT / "exports"

# (run-set-id, display name, short key)  — finished pilots only
PILOTS = [
    ("pilot-dev-v2", "DeepSeek", "ds"),
    ("pilot-dev-v2-openai", "Luna none", "luna-n"),
    ("pilot-dev-v2-openai-low", "Luna low", "luna-l"),
    ("pilot-dev-v2-modelscope-max", "Qwen3.7-max", "qmax"),
    ("pilot-dev-v2-modelscope-plus", "Qwen3.7-plus", "qplus"),
    ("pilot-gemini-37", "Gemini 3.7-fl", "g37"),
    ("pilot-gemini-35-lite", "Gemini 3.5-lite", "g35l"),
    ("pilot-terra-80", "Terra", "terra"),
    ("pilot-muse-80", "Muse", "muse"),
    ("pilot-grok-80", "Grok 4.6", "grok"),
    ("pilot-sol-50", "Sol", "sol"),
]

N_BOOT = 2000
SEED = 42


def load_runs(runset: str) -> dict:
    """episodeId -> {finalCorrect, priorCorrect, confidence, condition}."""
    path = REPORTS / runset / "runs.csv"
    out = {}
    import csv

    with path.open(newline="", encoding="utf8") as f:
        for row in csv.DictReader(f):
            if row["status"] != "completed":
                continue
            ep = row["episodeId"]
            claim_id, cond = ep.split("__", 1)
            out[ep] = {
                "finalCorrect": row["finalCorrect"] == "true",
                "priorCorrect": row["priorCorrect"] == "true",
                "confidence": float(row["confidence"]),
                "condition": cond,
                "claimId": claim_id,
            }
    return out


def load_score(runset: str) -> dict:
    return json.loads((REPORTS / runset / "score-report.json").read_text(encoding="utf8"))


def paired_bootstrap(a: np.ndarray, b: np.ndarray) -> tuple[float, float, float]:
    """Mean paired diff (a-b), 95% CI via bootstrap. CI excluding 0 => significant."""
    d = a.astype(float) - b.astype(float)
    n = len(d)
    rng = np.random.default_rng(SEED)
    idx = rng.integers(0, n, size=(N_BOOT, n))
    diffs = d[idx].mean(axis=1)
    lo, hi = np.percentile(diffs, [2.5, 97.5])
    return float(d.mean()), float(lo), float(hi)


def main() -> int:
    data = {key: load_runs(runset) for runset, _name, key in PILOTS}
    scores = {key: load_score(runset) for runset, _name, key in PILOTS}
    name = {key: n for _r, n, key in PILOTS}
    keys = [key for _r, _n, key in PILOTS]

    eps_per = {key: set(data[key]) for key in keys}
    all_common = set.intersection(*[eps_per[key] for key in keys])

    # ---- per-model accuracy on the common set ---------------------------
    acc = {}
    for key in keys:
        vals = np.array([data[key][ep]["finalCorrect"] for ep in all_common], float)
        acc[key] = vals.mean()
    rank = sorted(keys, key=lambda k: -acc[k])

    lines = []
    lines.append("# Cross-model analysis (dev-split pilots)\n")
    lines.append(
        f"Models: {len(keys)}. Common episodes (intersection of all pilots): "
        f"{len(all_common)}. Paired tests bootstrap n={N_BOOT} on the shared set.\n"
    )

    # ---- 1. pairwise paired significance --------------------------------
    lines.append("## 1. Paired accuracy differences (A - B, on common episodes)")
    lines.append("Only shown for adjacent/nearby ranks; CI excluding 0 = significant.\n")
    lines.append(f"| A | B | A acc | B acc | diff | 95% CI | sig |")
    lines.append("|---|---|---|---|---|---|---|")
    for i, ka in enumerate(rank):
        for kb in rank[i + 1 :]:
            common = sorted(eps_per[ka] & eps_per[kb])
            a = np.array([data[ka][ep]["finalCorrect"] for ep in common])
            b = np.array([data[kb][ep]["finalCorrect"] for ep in common])
            diff, lo, hi = paired_bootstrap(a, b)
            sig = "**yes**" if (lo > 0 or hi < 0) else "no"
            lines.append(
                f"| {name[ka]} | {name[kb]} | {a.mean():.3f} | {b.mean():.3f} | "
                f"{diff:+.3f} | [{lo:+.3f}, {hi:+.3f}] | {sig} |"
            )
    lines.append("")

    # ---- 3. world difficulty + agreement ---------------------------------
    lines.append("## 2. World difficulty & cross-model agreement")
    counts = {}
    for ep in all_common:
        counts[ep] = sum(1 for key in keys if data[key][ep]["finalCorrect"])
    n_models = len(keys)
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
        cond = data[next(iter(keys))][ep]["condition"]
        lines.append(f"| {ep} | {c}/{n_models} | {cond} |")

    easiest_wrong = sum(1 for c in counts.values() if c == n_models)
    none_right = sum(1 for c in counts.values() if c == 0)
    lines.append(f"\nAll-models-correct: {easiest_wrong} | No-model-correct: {none_right}")

    # ---- 5. failure taxonomy --------------------------------------------
    lines.append("\n## 3. Failure taxonomy (per model, per-episode prior/final)")
    lines.append(
        "Categories: Rescued (prior wrong -> final right), Corruption (prior right -> final wrong), "
        "Stuck-wrong (prior wrong -> final wrong), Correct-and-stable.\n"
    )
    lines.append("| Model | Rescued | Corruption | Stuck-wrong | Correct-stable | PRR |")
    lines.append("|---|---|---|---|---|---|")
    for key in keys:
        res = corr = stuck = stable = 0
        for ep, r in data[key].items():
            p, f = r["priorCorrect"], r["finalCorrect"]
            if p and f:
                stable += 1
            elif p and not f:
                corr += 1
            elif not p and f:
                res += 1
            else:
                stuck += 1
        prr = scores[key]["prr"]["value"]
        lines.append(
            f"| {name[key]} | {res} | {corr} | {stuck} | {stable} | {prr:.3f} |"
        )

    # condition-stratified corruption for the stratifying condition
    fm = "false_majority_true_primary"
    lines.append(f"\nCorruption on `{fm}` (prior correct -> final wrong):")
    lines.append("| Model | corrupted / had-correct-prior |")
    lines.append("|---|---|")
    for key in keys:
        had = [ep for ep, r in data[key].items() if r["condition"] == fm and r["priorCorrect"]]
        bad = [ep for ep in had if not data[key][ep]["finalCorrect"]]
        lines.append(f"| {name[key]} | {len(bad)}/{len(had)} |")

    # ---- 6. calibration + discrimination --------------------------------
    lines.append("\n## 4. Confidence calibration & discrimination")
    lines.append("(AUC = confidence's ability to separate correct from wrong; Brier lower better)\n")
    from sklearn.metrics import roc_auc_score, brier_score_loss

    lines.append("| Model | AUC | Brier | ECE | mean conf | accuracy |")
    lines.append("|---|---|---|---|---|---|")
    for key in keys:
        y = np.array([r["finalCorrect"] for r in data[key].values()], int)
        c = np.array([r["confidence"] for r in data[key].values()], float)
        ece = scores[key]["calibration"]["ece"]
        try:
            auc = roc_auc_score(y, c) if len(np.unique(y)) > 1 else float("nan")
        except ValueError:
            auc = float("nan")
        brier = brier_score_loss(y, c)
        lines.append(
            f"| {name[key]} | {auc:.3f} | {brier:.3f} | {ece:.3f} | {c.mean():.3f} | {y.mean():.3f} |"
        )

    # ---- figures ---------------------------------------------------------
    try:
        make_figures(rank, data, keys, name, all_common, counts, scores)
        lines.append("\nFigures written to `analysis/exports/`.")
    except Exception as exc:  # never block the report on plotting
        lines.append(f"\n(figures skipped: {exc})")

    out_md = OUT / "cross_model_report.md"
    out_md.write_text("\n".join(lines) + "\n", encoding="utf8")
    print(f"wrote {out_md}")
    print("\n".join(lines[:40]))
    return 0


def make_figures(rank, data, keys, name, all_common, counts, scores) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    EXPORTS.mkdir(parents=True, exist_ok=True)

    # pairwise diff heatmap
    n = len(keys)
    M = np.full((n, n), np.nan)
    for i, ka in enumerate(keys):
        for j, kb in enumerate(keys):
            if i == j:
                continue
            common = sorted(eps_per_local(data, ka) & eps_per_local(data, kb))
            if not common:
                continue
            a = np.array([data[ka][ep]["finalCorrect"] for ep in common], float)
            b = np.array([data[kb][ep]["finalCorrect"] for ep in common], float)
            M[i, j] = a.mean() - b.mean()
    fig, ax = plt.subplots(figsize=(8, 7))
    im = ax.imshow(M, cmap="RdYlGn", vmin=-0.10, vmax=0.10)
    labels = [name[k] for k in keys]
    ax.set_xticks(range(n), labels, rotation=45, ha="right", fontsize=8)
    ax.set_yticks(range(n), labels, fontsize=8)
    for i in range(n):
        for j in range(n):
            if i != j and not np.isnan(M[i, j]):
                ax.text(j, i, f"{M[i, j]:+.2f}", ha="center", va="center", fontsize=6)
    ax.set_title("Paired accuracy difference (row - col), common episodes")
    fig.colorbar(im, label="accuracy difference")
    fig.tight_layout()
    fig.savefig(EXPORTS / "fig_pairwise_diff.png", dpi=140)
    plt.close(fig)

    # agreement histogram + AUC bar
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))
    n_models = len(keys)
    h = [0] * (n_models + 1)
    for c in counts.values():
        h[c] += 1
    axes[0].bar(range(n_models + 1), h, color="#7aa")
    axes[0].set_xlabel("# models correct")
    axes[0].set_ylabel("episodes")
    axes[0].set_title("Cross-model agreement distribution")

    from sklearn.metrics import roc_auc_score

    aucs, akeys = [], []
    for k in keys:
        y = np.array([r["finalCorrect"] for r in data[k].values()], int)
        c = np.array([r["confidence"] for r in data[k].values()], float)
        try:
            aucs.append(roc_auc_score(y, c) if len(np.unique(y)) > 1 else np.nan)
        except ValueError:
            aucs.append(np.nan)
        akeys.append(k)
    order = np.argsort([-a if not np.isnan(a) else 1 for a in aucs])
    axes[1].bar([name[akeys[i]] for i in order], [aucs[i] for i in order], color="#a7a")
    axes[1].axhline(0.5, ls="--", c="#999")
    axes[1].set_ylim(0.4, 1.0)
    axes[1].tick_params(axis="x", rotation=45, labelsize=7)
    axes[1].set_ylabel("AUC (confidence -> correctness)")
    axes[1].set_title("Confidence discrimination")
    fig.tight_layout()
    fig.savefig(EXPORTS / "fig_agreement_auc.png", dpi=140)
    plt.close(fig)


def eps_per_local(data, key):
    return set(data[key])


if __name__ == "__main__":
    raise SystemExit(main())
