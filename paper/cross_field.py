"""Cross-model paired analysis over the paper's eligible field configurations.

Field membership, the pairwise bootstrap, and multiplicity handling all come
from a single, principled rule instead of a hand-typed model list:

  - eligible(): a config is eligible for the field leaderboard/pairwise
    table/cost frontier iff (a) its manifest role is 'field', (b) its report
    directory is present, (c) it has >=50 completed dev-split runs, and
    (d) its rejection rate is <=10%. Everything else (effort-appendix,
    route-appendix, or field-role-but-ineligible) is excluded here and
    reported separately (see run_manifest.json's 'role'/'note' fields).
  - The pairwise bootstrap resamples whole CLAIMS with replacement, not
    individual episode rows -- matching PREREG.md's stated methodology
    ("percentile bootstrap clustered by claim") and packages/evaluator's
    clusteredBootstrap, which the previous row-level resample here
    contradicted (each "episode" is claimId__condition, so treating rows as
    independent double-counts within-claim correlation).
  - Two-tier multiplicity: each field member vs. the shared-episode accuracy leader gets a
    Holm-Bonferroni-corrected comparison (the "vs-leader" family, what the
    main text and fig_pairwise actually foreground); the full pairwise
    matrix (every pair) stays uncorrected/exploratory and is labeled as such.

Writes both a structured `cross_field_data.json` (the actual input to
gen_tables.py/gen_figures.py from here on) and a human-readable
`cross_field_report.md` rendering of the same data.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from validate_manifest import load_manifest, report_dir

REPO = Path(__file__).resolve().parents[1]
REPORTS = REPO / "reports" / "dev"
N_BOOT = 2000
SEED = 42
MIN_COMPLETED_RUNS = 50
MAX_REJECTION_RATE = 0.10


def eligible(model: dict, score: dict) -> bool:
    """The one eligibility rule, applied uniformly to every manifest entry."""
    if model["role"] != "field" or model["status"] != "available":
        return False
    total = score.get("totalRuns", 0) or 0
    completed = score.get("completedRuns", 0) or 0
    rejected = score.get("rejectedRuns", 0) or 0
    if completed < MIN_COMPLETED_RUNS:
        return False
    if total > 0 and rejected / total > MAX_REJECTION_RATE:
        return False
    return True


def load_field(manifest: dict):
    """Return [(model_id, display_name, runSet, score_dict)] for eligible configs."""
    field = []
    for m in manifest["models"]:
        score_path = report_dir(m["runSet"]) / "score-report.json"
        if not score_path.is_file():
            continue
        score = json.loads(score_path.read_text(encoding="utf-8"))
        if eligible(m, score):
            field.append((m["modelId"], m["displayName"], m["runSet"], score))
    return field


def load_runs(runset: str) -> dict:
    out = {}
    with (REPORTS / runset / "runs.csv").open(newline="", encoding="utf8") as f:
        for row in csv.DictReader(f):
            if row["status"] != "completed":
                continue
            ep = row["episodeId"]
            claim_id, cond = ep.split("__", 1)
            out[ep] = {
                "claimId": claim_id,
                "finalCorrect": row["finalCorrect"] == "true",
                "priorCorrect": row["priorCorrect"] == "true",
                "condition": cond,
            }
    return out


def paired_bootstrap_clustered(pairs_by_episode: dict, common_episodes) -> dict:
    """Claim-clustered percentile bootstrap over a shared episode set.

    pairs_by_episode: {episodeId: (claimId, a_correct, b_correct)} restricted
    to `common_episodes`. Resamples whole claims with replacement (not
    individual episodes), matching PREREG.md's stated methodology.
    """
    by_claim = defaultdict(list)
    for ep in common_episodes:
        cid, a, b = pairs_by_episode[ep]
        by_claim[cid].append((a, b))
    claim_ids = sorted(by_claim)
    n_claims = len(claim_ids)
    all_a = [a for v in by_claim.values() for a, _ in v]
    all_b = [b for v in by_claim.values() for _, b in v]
    point = float(np.mean(all_a) - np.mean(all_b)) if all_a else 0.0
    if n_claims == 0:
        return {"diff": 0.0, "lo": 0.0, "hi": 0.0, "p": 1.0, "nClaims": 0}

    rng = np.random.default_rng(SEED)
    diffs = np.empty(N_BOOT)
    claim_lists = [by_claim[c] for c in claim_ids]
    for i in range(N_BOOT):
        picks = rng.integers(0, n_claims, size=n_claims)
        a_vals, b_vals = [], []
        for p in picks:
            for a, b in claim_lists[p]:
                a_vals.append(a)
                b_vals.append(b)
        diffs[i] = np.mean(a_vals) - np.mean(b_vals)
    lo, hi = (float(x) for x in np.percentile(diffs, [2.5, 97.5]))
    # Two-tailed bootstrap p-value: proportion of resamples on the other side of zero, doubled.
    p_le = float(np.mean(diffs <= 0))
    p_ge = float(np.mean(diffs >= 0))
    p = min(1.0, 2 * min(p_le, p_ge))
    return {"diff": point, "lo": lo, "hi": hi, "p": p, "nClaims": n_claims}


POISON_CONDITIONS = ["single_poison", "ranked_poison", "manufactured_consensus", "false_majority_true_primary"]


def compute_population_disclosure(data: dict, names: list) -> dict:
    """Per eligible config: an unconditional accuracy on poison conditions (not
    restricted to the prior-correct-only subset FBAR uses) and a prior-
    stratified accuracy breakdown, computed from each config's already-loaded
    runs.csv (no new data collection).

    Addresses Thorough Reviewer 1's "EAS mixes model-dependent populations"
    concern: FBAR conditions on the prior-correct subset of poison-condition
    runs, CUR conditions on the prior-incorrect/abstained subset of
    legitimate_update runs -- these are different, model-dependent
    populations (a model with a higher prior-accuracy rate has a smaller,
    differently-composed FBAR denominator than one with a lower rate). This
    reports the full population behind the rate so it isn't read as directly
    comparable across models without that qualification.
    """
    out = {}
    for n in names:
        poison_runs = [r for r in data[n].values() if r["condition"] in POISON_CONDITIONS]
        total = len(poison_runs)
        correct = sum(1 for r in poison_runs if r["finalCorrect"])
        prior_correct = [r for r in poison_runs if r["priorCorrect"]]
        prior_not_correct = [r for r in poison_runs if not r["priorCorrect"]]

        def stratum(rows):
            n_rows = len(rows)
            n_correct = sum(1 for r in rows if r["finalCorrect"])
            return {
                "n": n_rows,
                "accuracy": (n_correct / n_rows) if n_rows else None,
            }

        out[n] = {
            "unconditionalPoisonAccuracy": {
                "value": (correct / total) if total else None,
                "numerator": correct,
                "denominator": total,
            },
            "priorStratified": {
                "priorCorrect": stratum(prior_correct),
                "priorNotCorrect": stratum(prior_not_correct),
            },
        }
    return out


def holm_bonferroni(pvals: list, alpha: float = 0.05) -> list:
    """Holm step-down: returns a same-length list of booleans (reject H0)."""
    m = len(pvals)
    order = sorted(range(m), key=lambda i: pvals[i])
    reject = [False] * m
    for rank, idx in enumerate(order):
        alpha_i = alpha / (m - rank)
        if pvals[idx] <= alpha_i:
            reject[idx] = True
        else:
            break
    return reject


def main() -> int:
    manifest = load_manifest()
    field = load_field(manifest)
    names = [display for _, display, _, _ in field]
    scores = {display: score for _, display, _, score in field}
    runsets = {display: runset for _, display, runset, _ in field}
    data = {display: load_runs(runset) for _, display, runset, _ in field}

    eps = {name: set(d) for name, d in data.items()}
    common = set.intersection(*eps.values()) if eps else set()
    n_models = len(names)
    print("eligible field models:", n_models)
    for _, display, runset, score in field:
        print(f"  {display}: runSet={runset} completed={score['completedRuns']}/{score['totalRuns']} rejected={score['rejectedRuns']}")
    print("common episodes:", len(common))

    acc = {n: float(np.mean([data[n][ep]["finalCorrect"] for ep in common])) for n in names} if common else {}
    rank = sorted(names, key=lambda n: -acc[n])
    leader = rank[0] if rank else None

    # ---- full pairwise matrix (exploratory, uncorrected) ----
    pairwise_rows = []
    for i, ka in enumerate(rank):
        for kb in rank[i + 1:]:
            common_pair = sorted(eps[ka] & eps[kb])
            pairs_by_ep = {ep: (data[ka][ep]["claimId"], float(data[ka][ep]["finalCorrect"]), float(data[kb][ep]["finalCorrect"])) for ep in common_pair}
            boot = paired_bootstrap_clustered(pairs_by_ep, common_pair)
            sig = boot["lo"] > 0 or boot["hi"] < 0
            pairwise_rows.append({
                "a": ka, "b": kb,
                "accA": acc[ka], "accB": acc[kb],
                "diff": boot["diff"], "lo": boot["lo"], "hi": boot["hi"],
                "significant": sig, "corrected": False, "pValue": boot["p"],
            })

    # ---- vs-leader family (confirmatory, Holm-Bonferroni corrected) ----
    vs_leader_rows = []
    if leader is not None:
        raw_pvals = []
        tmp_rows = []
        for n in names:
            if n == leader:
                continue
            common_pair = sorted(eps[leader] & eps[n])
            pairs_by_ep = {ep: (data[leader][ep]["claimId"], float(data[leader][ep]["finalCorrect"]), float(data[n][ep]["finalCorrect"])) for ep in common_pair}
            boot = paired_bootstrap_clustered(pairs_by_ep, common_pair)
            tmp_rows.append({"a": leader, "b": n, "accA": acc[leader], "accB": acc[n],
                              "diff": boot["diff"], "lo": boot["lo"], "hi": boot["hi"], "pValue": boot["p"]})
            raw_pvals.append(boot["p"])
        rejected = holm_bonferroni(raw_pvals) if raw_pvals else []
        for row, sig in zip(tmp_rows, rejected):
            row["significant"] = sig
            row["corrected"] = True
            vs_leader_rows.append(row)

    # ---- population-mixing disclosure (Thorough Reviewer 1 concern #3) ----
    population_disclosure = compute_population_disclosure(data, names)

    # ---- world difficulty & cross-model agreement ----
    counts = {ep: sum(1 for n in names if data[n][ep]["finalCorrect"]) for ep in common}
    hist = {v: 0 for v in range(n_models + 1)}
    for c in counts.values():
        hist[c] += 1
    hardest = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]))[:15]
    all_correct = sum(1 for c in counts.values() if c == n_models)
    none_right = sum(1 for c in counts.values() if c == 0)

    # ---- failure taxonomy ----
    taxonomy = {}
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
        taxonomy[n] = {"rescued": res, "corrupted": corr, "stuckWrong": stuck, "correctStable": stable,
                        "prr": scores[n]["prr"]["value"]}

    fm = "false_majority_true_primary"
    fm_corruption = {}
    for n in names:
        had = [ep for ep, r in data[n].items() if r["condition"] == fm and r["priorCorrect"]]
        bad = [ep for ep in had if not data[n][ep]["finalCorrect"]]
        fm_corruption[n] = {"corrupted": len(bad), "hadCorrectPrior": len(had)}

    # ---- calibration & discrimination ----
    from sklearn.metrics import roc_auc_score, brier_score_loss
    calibration = []
    for _, display, runset, score in field:
        y, c = [], []
        with (REPORTS / runset / "runs.csv").open(newline="", encoding="utf8") as f:
            for row in csv.DictReader(f):
                if row["status"] != "completed":
                    continue
                y.append(1 if row["finalCorrect"] == "true" else 0)
                c.append(float(row["confidence"]))
        y_arr = np.array(y, int)
        c_arr = np.array(c, float)
        auc = float(roc_auc_score(y_arr, c_arr)) if len(np.unique(y_arr)) > 1 else None
        brier = float(brier_score_loss(y_arr, c_arr))
        ece = score["calibration"]["ece"]
        calibration.append({
            "model": display, "auc": auc, "brier": brier, "ece": ece,
            "meanConfidence": float(c_arr.mean()) if len(c_arr) else None,
            "accuracy": float(y_arr.mean()) if len(y_arr) else None,
        })

    struct = {
        "schemaVersion": 1,
        "fieldSize": n_models,
        "fieldModels": names,
        "leader": leader,
        "commonEpisodeCount": len(common),
        "commonEpisodes": sorted(common),
        "pairwise": {
            "vsLeader": vs_leader_rows,
            "fullMatrix": pairwise_rows,
        },
        "worldDifficulty": {
            "histogram": [{"modelsCorrect": v, "episodes": hist[v]} for v in sorted(hist, reverse=True)],
            "hardest": [{"episode": ep, "modelsCorrect": c, "condition": data[names[0]][ep]["condition"]} for ep, c in hardest],
            "allCorrect": all_correct,
            "noneCorrect": none_right,
        },
        "taxonomy": taxonomy,
        "falseMajorityCorruption": fm_corruption,
        "calibration": calibration,
        "populationDisclosure": population_disclosure,
    }
    out_json = Path(__file__).resolve().parent / "cross_field_data.json"
    out_json.write_text(json.dumps(struct, indent=2), encoding="utf-8")
    print(f"wrote {out_json.name}")

    _write_markdown(struct)
    return 0


def _write_markdown(struct: dict) -> None:
    """Human-readable rendering of cross_field_data.json. A byproduct, not an input --
    gen_tables.py/gen_figures.py read the JSON, never this file."""
    lines = [f"# Cross-model analysis, eligible field ({struct['fieldSize']} configurations)\n"]
    lines.append(
        f"Models: {struct['fieldSize']}. Common episodes (intersection of all eligible "
        f"configs): {struct['commonEpisodeCount']}. Paired tests: claim-clustered percentile "
        f"bootstrap, n={N_BOOT}.\n"
    )

    lines.append("## 0. Vs-leader family (Holm-Bonferroni corrected, confirmatory)")
    lines.append(f"Leader: {struct['leader']}.\n")
    lines.append("| A | B | Acc A | Acc B | diff | 95% CI | sig (corrected) |")
    lines.append("|---|---|---|---|---|---|---|")
    for r in struct["pairwise"]["vsLeader"]:
        sig = "**yes**" if r["significant"] else "no"
        lines.append(f"| {r['a']} | {r['b']} | {r['accA']:.3f} | {r['accB']:.3f} | {r['diff']:+.3f} | [{r['lo']:+.3f}, {r['hi']:+.3f}] | {sig} |")
    lines.append("")

    lines.append("## 1. Full pairwise matrix (exploratory, NOT multiplicity-adjusted)")
    lines.append("Every pair; CI excluding 0 flagged, but not corrected for the number of comparisons. See section 0 for the multiplicity-adjusted vs-leader family.\n")
    lines.append("| A | B | A acc | B acc | diff | 95% CI | sig |")
    lines.append("|---|---|---|---|---|---|---|")
    for r in struct["pairwise"]["fullMatrix"]:
        sig = "**yes**" if r["significant"] else "no"
        lines.append(f"| {r['a']} | {r['b']} | {r['accA']:.3f} | {r['accB']:.3f} | {r['diff']:+.3f} | [{r['lo']:+.3f}, {r['hi']:+.3f}] | {sig} |")
    lines.append("")

    lines.append("## 2. World difficulty & cross-model agreement")
    lines.append(f"\nEpisodes by #models-correct (of {struct['fieldSize']}):")
    lines.append("| #models correct | episodes |")
    lines.append("|---|---|")
    for row in struct["worldDifficulty"]["histogram"]:
        lines.append(f"| {row['modelsCorrect']}/{struct['fieldSize']} | {row['episodes']} |")
    lines.append("\nHardest worlds (fewest models correct):")
    lines.append("| episode | models correct | condition |")
    lines.append("|---|---|---|")
    for row in struct["worldDifficulty"]["hardest"]:
        lines.append(f"| {row['episode']} | {row['modelsCorrect']}/{struct['fieldSize']} | {row['condition']} |")
    lines.append(f"\nAll-models-correct: {struct['worldDifficulty']['allCorrect']} | No-model-correct: {struct['worldDifficulty']['noneCorrect']}")

    lines.append("\n## 3. Failure taxonomy (per model, per-episode prior/final)")
    lines.append("| Model | Rescued | Corruption | Stuck-wrong | Correct-stable | PRR |")
    lines.append("|---|---|---|---|---|---|")
    for n, t in struct["taxonomy"].items():
        prr = t["prr"] if t["prr"] is not None else float("nan")
        lines.append(f"| {n} | {t['rescued']} | {t['corrupted']} | {t['stuckWrong']} | {t['correctStable']} | {prr:.3f} |")
    fm = "false_majority_true_primary"
    lines.append(f"\nCorruption on `{fm}` (prior correct -> final wrong):")
    lines.append("| Model | corrupted / had-correct-prior |")
    lines.append("|---|---|")
    for n, c in struct["falseMajorityCorruption"].items():
        lines.append(f"| {n} | {c['corrupted']}/{c['hadCorrectPrior']} |")

    lines.append("\n## 4. Confidence calibration & discrimination")
    lines.append("(AUC = confidence's ability to separate correct from wrong; Brier lower better)\n")
    lines.append("| Model | AUC | Brier | ECE | mean conf | accuracy |")
    lines.append("|---|---|---|---|---|---|")
    for c in struct["calibration"]:
        auc = f"{c['auc']:.3f}" if c["auc"] is not None else "n/a"
        lines.append(f"| {c['model']} | {auc} | {c['brier']:.3f} | {c['ece']:.3f} | {c['meanConfidence']:.3f} | {c['accuracy']:.3f} |")

    lines.append("\n## 5. Population-mixing disclosure")
    lines.append(
        "FBAR conditions on the prior-correct subset of poison-condition runs; CUR conditions "
        "on the prior-incorrect/abstained subset of legitimate_update runs. These are different, "
        "model-dependent populations. This table reports the unconditional accuracy on all "
        "poison-condition runs (not just the prior-correct subset) alongside a prior-stratified "
        "breakdown, so the populations behind each headline rate are visible.\n"
    )
    lines.append("| Model | Unconditional poison accuracy | n (prior-correct) | acc (prior-correct) | n (prior-not-correct) | acc (prior-not-correct) |")
    lines.append("|---|---|---|---|---|---|")
    for n, d in struct["populationDisclosure"].items():
        up = d["unconditionalPoisonAccuracy"]
        pc = d["priorStratified"]["priorCorrect"]
        pn = d["priorStratified"]["priorNotCorrect"]
        up_str = f"{up['value']:.3f} ({up['numerator']}/{up['denominator']})" if up["value"] is not None else "n/a"
        pc_str = f"{pc['accuracy']:.3f}" if pc["accuracy"] is not None else "n/a"
        pn_str = f"{pn['accuracy']:.3f}" if pn["accuracy"] is not None else "n/a"
        lines.append(f"| {n} | {up_str} | {pc['n']} | {pc_str} | {pn['n']} | {pn_str} |")

    out = Path(__file__).resolve().parent / "cross_field_report.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {out.name}")


if __name__ == "__main__":
    raise SystemExit(main())
