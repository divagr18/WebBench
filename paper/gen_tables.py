"""Generate LaTeX table fragments for the paper from paper_data.json and
cross_field_data.json -- never from markdown-parsing cross_field_report.md,
which is a human-readable byproduct only (see cross_field.py).

Outputs into paper/tables/. Values are transcribed programmatically to avoid
hand-copy errors; best values per column are bolded.
"""
import json
import os
from decimal import Decimal, ROUND_HALF_UP

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "tables")
os.makedirs(OUT, exist_ok=True)
DATA = json.load(open(os.path.join(HERE, "paper_data.json"), encoding="utf-8"))
CROSS = json.load(open(os.path.join(HERE, "cross_field_data.json"), encoding="utf-8"))

# Field-only view for the leaderboard/full-matrix/conditions tables. This must be the
# SAME set cross_field.py's eligible() computed (CROSS["fieldModels"], keyed by
# displayName) -- not a separate role=="field" re-filter. A role=="field" config that
# fails the completeness/rejection-rate bar (e.g. too few completed runs) must not
# appear here while also being absent from the pairwise table/cost frontier: that
# in-some-tables-out-of-others inconsistency is exactly critical issue #1 from both
# peer reviews (originally about GLM 5.2), and re-deriving eligibility a second time
# here would risk silently drifting from cross_field.py's version of the same rule.
_field_display_names = set(CROSS["fieldModels"])
FIELD_KEYS = [k for k, d in DATA.items() if d["displayName"] in _field_display_names]
ORDER = sorted(FIELD_KEYS, key=lambda k: DATA[k]["eas"], reverse=True)


def fmt(v, nd=3):
    q = Decimal(1).scaleb(-nd)
    return str(Decimal(str(v)).quantize(q, rounding=ROUND_HALF_UP))


def maybe_bold(s, is_best):
    return f"\\textbf{{{s}}}" if is_best else s


def write(name, lines):
    open(os.path.join(OUT, name), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(name)


# ------------------------------------------------ macros (prevents eleven/ten drift)
# \RosterSize = the intended full study roster (every manifest entry with role="field",
#   available or not yet supplied) -- the abstract's "how many configs are we studying".
# \FieldSize = how many of those are actually eligible for the comparative leaderboard/
#   pairwise table/cost frontier right now (available + passes eligible() in cross_field.py)
#   -- the results section's "how many configs can we actually compare today". These are
# genuinely different quantities; conflating them under one hand-typed number is exactly
# the eleven-vs-ten drift both reviews flagged.
manifest = json.load(open(os.path.join(HERE, "run_manifest.json"), encoding="utf-8"))
roster_size = sum(1 for m in manifest["models"] if m["role"] == "field")
macro_lines = [
    f"\\newcommand{{\\RosterSize}}{{{roster_size}}}",
    f"\\newcommand{{\\FieldSize}}{{{len(ORDER)}}}",
    f"\\newcommand{{\\CommonEpisodes}}{{{CROSS['commonEpisodeCount']}}}",
]
write("tab_macros.tex", macro_lines)

# ------------------------------------------------ headline table (main text)
cols = [
    ("eas", lambda d: d["eas"], True, 3),
    ("fbar", lambda d: d["fbar"], False, 3),
    ("cur", lambda d: d["cur"], True, 3),
    ("pcr", lambda d: d["pcr"], False, 3),
    ("ics", lambda d: d["ics"], True, 3),
    ("prr", lambda d: d["prr"], False, 3),
    ("ci", lambda d: d["ci"], True, 3),
    ("brier", lambda d: d["brier"], False, 3),
    ("ece", lambda d: d["ece"], False, 3),
]
best = {}
for key, acc, hib, _ in cols:
    vals = [(acc(DATA[k]), k) for k in ORDER if DATA[k].get(key) is not None]
    if not vals:
        continue
    extremum = max(vals)[0] if hib else min(vals)[0]
    best[key] = extremum

lines = []
lines.append(r"\begin{tabular}{l" + "c" * len(cols) + "r}")
lines.append(r"\toprule")
lines.append(r"Model & EAS & FBAR $\downarrow$ & CUR & PCR $\downarrow$ & ICS & PRR $\downarrow$ & CI & Brier $\downarrow$ & ECE $\downarrow$ & Est. \$ / episode \\")
lines.append(r"\midrule")
for k in ORDER:
    d = DATA[k]
    cells = []
    for key, acc, hib, nd in cols:
        v = acc(d)
        cells.append(maybe_bold(fmt(v, nd), key in best and abs(v - best[key]) < 1e-12))
    cost_per_episode = d["cost"] / d["completedRuns"]
    row = d["displayName"] + " & " + " & ".join(cells) + f" & {cost_per_episode:.3f} \\\\"
    lines.append(row)
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
write("tab_headline.tex", lines)

# ------------------------------------------------ appendix: full metric matrix
cols_full = cols + [
    ("ser", lambda d: d["ser"], True, 3),
    ("psr", lambda d: d["psr"], True, 3),
    ("tua", lambda d: d["tua"], True, 3),
]
best_full = {}
for key, acc, hib, _ in cols_full:
    vals = [(acc(DATA[k]), k) for k in ORDER if DATA[k].get(key) is not None]
    if not vals:
        continue
    extremum = max(vals)[0] if hib else min(vals)[0]
    best_full[key] = extremum

lines = []
lines.append(r"\begin{tabular}{l" + "c" * len(cols_full) + "}")
lines.append(r"\toprule")
lines.append(r"Model & EAS & FBAR & CUR & PCR & ICS & PRR & CI & Brier & ECE & SER & PSR & TUA \\")
lines.append(r"\midrule")
for k in ORDER:
    d = DATA[k]
    cells = []
    for key, acc, hib, nd in cols_full:
        v = acc(d)
        cells.append(maybe_bold(fmt(v, nd), key in best_full and abs(v - best_full[key]) < 1e-12))
    lines.append(d["displayName"] + " & " + " & ".join(cells) + r" \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
write("tab_full_matrix.tex", lines)

# ------------------------------------------------ condition accuracy table
COND_ORDER = ["clean", "single_poison", "ranked_poison", "manufactured_consensus",
              "legitimate_update", "false_majority_true_primary"]
COND_TEX = {
    "clean": "Clean",
    "single_poison": "Single poison",
    "ranked_poison": "Ranked poison",
    "manufactured_consensus": "Manuf.\ consensus",
    "legitimate_update": "Legit.\ update",
    "false_majority_true_primary": "False majority",
}
best_cond = {}
for c in COND_ORDER:
    vals = [DATA[k]["conditions"][c]["acc"] for k in ORDER if DATA[k]["conditions"][c]["total"] > 0]
    if vals:
        best_cond[c] = max(vals)

lines = []
lines.append(r"\begin{tabular}{l" + "c" * len(COND_ORDER) + "}")
lines.append(r"\toprule")
lines.append("Model & " + " & ".join(COND_TEX[c] for c in COND_ORDER) + r" \\")
lines.append(r"\midrule")
for k in ORDER:
    cells = []
    for c in COND_ORDER:
        v = DATA[k]["conditions"][c]["acc"]
        cells.append(maybe_bold(fmt(v, 3), c in best_cond and abs(v - best_cond[c]) < 1e-12))
    lines.append(DATA[k]["displayName"] + " & " + " & ".join(cells) + r" \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
write("tab_conditions.tex", lines)

# ------------------------------------------------ run-flow table (intention-to-treat visibility)
lines = []
lines.append(r"\begin{tabular}{l" + "c" * len(COND_ORDER) + "}")
lines.append(r"\toprule")
lines.append(r"\multicolumn{" + str(len(COND_ORDER) + 1) + r"}{l}{Completed / rejected / failed, per condition} \\")
lines.append("Model & " + " & ".join(COND_TEX[c] for c in COND_ORDER) + r" \\")
lines.append(r"\midrule")
for k in ORDER:
    cells = []
    for c in COND_ORDER:
        cd = DATA[k]["conditions"][c]
        cells.append(f"{cd['total']}/{cd['rejected']}/{cd['failed']}")
    lines.append(DATA[k]["displayName"] + " & " + " & ".join(cells) + r" \\")
lines.append(r"\midrule")
lines.append(r"\multicolumn{" + str(len(COND_ORDER) + 1) + r"}{l}{Headline EAS vs. intention-to-treat EAS (rejected = incorrect)} \\")
lines.append(r"\midrule")
for k in ORDER:
    itt = DATA[k].get("itt")
    itt_eas = fmt(itt["eas"], 3) if itt and itt.get("eas") is not None else "n/a"
    lines.append(DATA[k]["displayName"] + f" & \\multicolumn{{{len(COND_ORDER)}}}{{l}}{{EAS {fmt(DATA[k]['eas'], 3)}, ITT-EAS {itt_eas}}} \\\\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
write("tab_run_flow.tex", lines)

# ------------------------------------------------ pairwise tables (from cross_field_data.json)
lines = []
lines.append(r"\begin{tabular}{llrrccc}")
lines.append(r"\toprule")
lines.append(r"A & B & Acc A & Acc B & $\Delta$ & 95\% CI & sig. (Holm) \\")
lines.append(r"\midrule")
for r in CROSS["pairwise"]["vsLeader"]:
    if r["significant"]:
        lines.append(rf"\textbf{{{r['a']}}} & \textbf{{{r['b']}}} & {r['accA']:.3f} & {r['accB']:.3f} & \textbf{{{r['diff']:+.3f}}} & [{r['lo']:+.3f}, {r['hi']:+.3f}] & \textbf{{yes}} \\")
    else:
        lines.append(rf"{r['a']} & {r['b']} & {r['accA']:.3f} & {r['accB']:.3f} & {r['diff']:+.3f} & [{r['lo']:+.3f}, {r['hi']:+.3f}] & no \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
write("tab_pairwise_vsleader.tex", lines)

lines = []
lines.append(r"\begin{longtable}{llrrccc}")
lines.append(
    r"\caption{All pairwise accuracy differences across the \FieldSize{} eligible field "
    r"configurations on their \CommonEpisodes{} shared episodes; $\Delta = \mathrm{Acc}(A) - "
    r"\mathrm{Acc}(B)$, claim-clustered percentile bootstrap (2000 resamples). "
    r"\textbf{Exploratory, not multiplicity-adjusted} -- see the vs-leader table for the "
    r"Holm-Bonferroni-corrected confirmatory family. Rows whose 95\% CI excludes zero are bolded "
    r"but should be read as ``the current pilot does not resolve the difference'' when not "
    r"bolded, not as evidence of equality.}\label{tab:pairwise-full}\\"
)
lines.append(r"\toprule")
lines.append(r"A & B & Acc A & Acc B & $\Delta$ & 95\% CI & sig. \\")
lines.append(r"\midrule")
lines.append(r"\endfirsthead")
lines.append(r"\toprule")
lines.append(r"A & B & Acc A & Acc B & $\Delta$ & 95\% CI & sig. \\")
lines.append(r"\midrule")
lines.append(r"\endhead")
lines.append(r"\midrule")
lines.append(r"\multicolumn{7}{r}{\emph{continued on next page}} \\")
lines.append(r"\endfoot")
lines.append(r"\bottomrule")
lines.append(r"\endlastfoot")
for r in CROSS["pairwise"]["fullMatrix"]:
    if r["significant"]:
        lines.append(rf"\textbf{{{r['a']}}} & \textbf{{{r['b']}}} & {r['accA']:.3f} & {r['accB']:.3f} & \textbf{{{r['diff']:+.3f}}} & [{r['lo']:+.3f}, {r['hi']:+.3f}] & \textbf{{yes}} \\")
    else:
        lines.append(rf"{r['a']} & {r['b']} & {r['accA']:.3f} & {r['accB']:.3f} & {r['diff']:+.3f} & [{r['lo']:+.3f}, {r['hi']:+.3f}] & no \\")
lines.append(r"\end{longtable}")
write("tab_pairwise.tex", lines)
print("tab_pairwise.tex", len(CROSS["pairwise"]["fullMatrix"]), "rows")

# --- world difficulty ---
lines = [r"\begin{tabular}{cr}"]
lines.append(r"\toprule")
lines.append(r"models correct & episodes \\")
lines.append(r"\midrule")
for row in CROSS["worldDifficulty"]["histogram"]:
    lines.append(rf"{row['modelsCorrect']}/{CROSS['fieldSize']} & {row['episodes']} \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
write("tab_world_dist.tex", lines)

lines = [r"\begin{tabular}{lcl}"]
lines.append(r"\toprule")
lines.append(r"episode & models correct & condition \\")
lines.append(r"\midrule")
for row in CROSS["worldDifficulty"]["hardest"]:
    ep = row["episode"].replace("_", r"\_")
    lines.append(rf"\texttt{{{ep}}} & {row['modelsCorrect']}/{CROSS['fieldSize']} & {row['condition'].replace('_', ' ')} \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
write("tab_worlds_hard.tex", lines)

# --- calibration ---
lines = [r"\begin{tabular}{lrrrrr}"]
lines.append(r"\toprule")
lines.append(r"Model & AUC & Brier & ECE & mean conf. & accuracy \\")
lines.append(r"\midrule")
for c in CROSS["calibration"]:
    auc = f"{c['auc']:.3f}" if c["auc"] is not None else "n/a"
    lines.append(rf"{c['model']} & {auc} & {c['brier']:.3f} & {c['ece']:.3f} & {c['meanConfidence']:.3f} & {c['accuracy']:.3f} \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
write("tab_calibration.tex", lines)

# ------------------------------------------------ metric denominators (population-mixing disclosure)
lines = []
lines.append(r"\begin{tabular}{lrrrr}")
lines.append(r"\toprule")
lines.append(r"Model & FBAR $N/D$ & CUR $N/D$ & PCR $N/D$ & PRR $N/D$ \\")
lines.append(r"\midrule")
for k in ORDER:
    d = DATA[k]
    row = " & ".join(f"{d[m + 'N']}/{d[m + 'D']}" for m in ("fbar", "cur", "pcr", "prr"))
    lines.append(d["displayName"] + " & " + row + r" \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
write("tab_metric_denominators.tex", lines)

# ------------------------------------------------ population-mixing disclosure (unconditional + prior-stratified)
lines = []
lines.append(r"\begin{tabular}{lrrrrr}")
lines.append(r"\toprule")
lines.append(r"Model & Uncond.\ poison acc.\ & $n$ (prior-correct) & acc.\ (prior-correct) & $n$ (prior-not-correct) & acc.\ (prior-not-correct) \\")
lines.append(r"\midrule")
for k in ORDER:
    disp = DATA[k]["displayName"]
    pd = CROSS.get("populationDisclosure", {}).get(disp)
    if not pd:
        continue
    up = pd["unconditionalPoisonAccuracy"]
    pc = pd["priorStratified"]["priorCorrect"]
    pn = pd["priorStratified"]["priorNotCorrect"]
    up_s = f"{up['value']:.3f}" if up["value"] is not None else "n/a"
    pc_s = f"{pc['accuracy']:.3f}" if pc["accuracy"] is not None else "n/a"
    pn_s = f"{pn['accuracy']:.3f}" if pn["accuracy"] is not None else "n/a"
    lines.append(rf"{disp} & {up_s} & {pc['n']} & {pc_s} & {pn['n']} & {pn_s} \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
write("tab_population_disclosure.tex", lines)

# ------------------------------------------------ pricing sources (cost price-card, dated + sourced)
PRICING = json.load(open(os.path.join(HERE, "pricing_sources.json"), encoding="utf-8"))
lines = []
lines.append(r"\begin{tabular}{lrrrl}")
lines.append(r"\toprule")
lines.append(r"Model / route & \$/M input & \$/M output & Checked & Verified \\")
lines.append(r"\midrule")
for e in PRICING["entries"]:
    ip = f"{e['inputPerM']:.3f}" if e["inputPerM"] is not None else "--"
    op = f"{e['outputPerM']:.3f}" if e["outputPerM"] is not None else "--"
    checked = e["dateChecked"] or "--"
    verified = r"\textbf{no}" if not e["verified"] else "yes"
    lines.append(rf"{e['displayName']} & {ip} & {op} & {checked} & {verified} \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
write("tab_pricing.tex", lines)

print("ALL TABLES DONE")
