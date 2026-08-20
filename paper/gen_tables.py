"""Generate LaTeX table fragments for the paper from the frozen pilot JSON.

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

NAME = {
    "deepseek-chat": "DeepSeek V4 Flash",
    "gpt-5.6-luna": "GPT-5.6 Luna",
    "qwen3.7-max": "Qwen3.7 Max",
    "qwen3.7-plus": "Qwen3.7 Plus",
    "gemini-3.7-fl": "Gemini 3.7 Flash",
    "gemini-3.5-lite": "Gemini 3.5 Flash-Lite",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "muse": "Muse Spark 1.2",
    "grok": "Grok 4.6",
    "gpt-5.6-sol": "GPT-5.6 Sol",
}
N_RUNS = {
    "deepseek-chat": 100, "gpt-5.6-luna": 100, "qwen3.7-max": 100,
    "qwen3.7-plus": 100, "gemini-3.7-fl": 100, "gemini-3.5-lite": 100,
    "gpt-5.6-terra": 80, "muse": 80, "grok": 80, "gpt-5.6-sol": 50,
}
ORDER = sorted(DATA.keys(), key=lambda k: DATA[k]["eas"], reverse=True)


def fmt(v, nd=3):
    q = Decimal(1).scaleb(-nd)
    return str(Decimal(str(v)).quantize(q, rounding=ROUND_HALF_UP))


def maybe_bold(s, is_best):
    return f"\\textbf{{{s}}}" if is_best else s


# ------------------------------------------------ headline table (main text)
cols = [
    # key, accessor, higher_is_better, decimals
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
    extremum = max(vals)[0] if hib else min(vals)[0]
    best[key] = extremum

lines = []
lines.append(r"\begin{tabular}{l" + "c" * len(cols) + "r}")
lines.append(r"\toprule")
lines.append(r"Model & EAS & FBAR $\downarrow$ & CUR & PCR $\downarrow$ & ICS & PRR $\downarrow$ & CI & Brier $\downarrow$ & ECE $\downarrow$ & \$ / 100 runs \\")
lines.append(r"\midrule")
for k in ORDER:
    d = DATA[k]
    cells = []
    for key, acc, hib, nd in cols:
        v = acc(d)
        cells.append(maybe_bold(fmt(v, nd), abs(v - best[key]) < 1e-12))
    cost100 = d["cost"] * 100.0 / N_RUNS[k]
    row = NAME[k] + " & " + " & ".join(cells) + f" & {cost100:.2f} \\\\"
    lines.append(row)
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
open(os.path.join(OUT, "tab_headline.tex"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("tab_headline.tex")

# ------------------------------------------------ appendix: full metric matrix
cols_full = cols + [
    ("ser", lambda d: d["ser"], True, 3),
    ("psr", lambda d: d["psr"], True, 3),
    ("tua", lambda d: d["tua"], True, 3),
]
best_full = {}
for key, acc, hib, _ in cols_full:
    vals = [(acc(DATA[k]), k) for k in ORDER]
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
        cells.append(maybe_bold(fmt(v, nd), abs(v - best_full[key]) < 1e-12))
    lines.append(NAME[k] + " & " + " & ".join(cells) + r" \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
open(os.path.join(OUT, "tab_full_matrix.tex"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("tab_full_matrix.tex")

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
    best_cond[c] = max(DATA[k]["conditions"][c]["acc"] for k in ORDER)

lines = []
lines.append(r"\begin{tabular}{l" + "c" * len(COND_ORDER) + "}")
lines.append(r"\toprule")
lines.append("Model & " + " & ".join(COND_TEX[c] for c in COND_ORDER) + r" \\")
lines.append(r"\midrule")
for k in ORDER:
    cells = []
    for c in COND_ORDER:
        v = DATA[k]["conditions"][c]["acc"]
        cells.append(maybe_bold(fmt(v, 3), abs(v - best_cond[c]) < 1e-12))
    lines.append(NAME[k] + " & " + " & ".join(cells) + r" \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
open(os.path.join(OUT, "tab_conditions.tex"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("tab_conditions.tex")

# ------------------------------------------------ appendix tables parsed from cross_model_report.md
import re

MD = open(os.path.join(HERE, "cross_field_report.md"), encoding="utf-8").read()


def md_rows(section_text):
    rows = []
    for ln in section_text.splitlines():
        ln = ln.strip()
        if ln.startswith("|") and not set(ln) <= set("|-: ") and "===" not in ln:
            cells = [c.strip() for c in ln.strip("|").split("|")]
            rows.append(cells)
    return rows


# --- pairwise table (section 1) ---
sec1 = MD.split("## 1.")[1].split("## 2.")[0]
rows = [r for r in md_rows(sec1)[1:] if len(r) == 7 and r[0] != "A"]
lines = []
lines.append(r"\begin{longtable}{llrrccc}")
lines.append(r"\caption{All pairwise accuracy differences across the ten field configurations on their 34 shared episodes; $\Delta = \mathrm{Acc}(A) - \mathrm{Acc}(B)$, percentile bootstrap (2000 resamples). Rows whose 95\% confidence interval excludes zero are bolded.}\label{tab:pairwise-full}\\")
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
for r in rows:
    sig = r[6].strip("* ")
    if sig == "yes":
        lines.append(rf"\textbf{{{r[0]}}} & \textbf{{{r[1]}}} & {r[2]} & {r[3]} & \textbf{{{r[4]}}} & {r[5]} & \textbf{{yes}} \\")
    else:
        lines.append(rf"{r[0]} & {r[1]} & {r[2]} & {r[3]} & {r[4]} & {r[5]} & no \\")
lines.append(r"\end{longtable}")
open(os.path.join(OUT, "tab_pairwise.tex"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("tab_pairwise.tex", len(rows), "rows")

# --- world difficulty (section 2) ---
sec2 = MD.split("## 2.")[1].split("## 3.")[0]
dist_rows, hard_rows = [], []
for r in md_rows(sec2):
    if len(r) == 2 and re.match(r"^\d+/\d+$", r[0]):
        dist_rows.append(r)
    if len(r) == 3 and re.match(r"^\d+/\d+$", r[1]):
        hard_rows.append(r)
lines = [r"\begin{tabular}{cr}"]
lines.append(r"\toprule")
lines.append(r"models correct & episodes \\")
lines.append(r"\midrule")
for r in dist_rows:
    lines.append(rf"{r[0]} & {r[1]} \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
open(os.path.join(OUT, "tab_world_dist.tex"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
lines = [r"\begin{tabular}{lcl}"]
lines.append(r"\toprule")
lines.append(r"episode & models correct & condition \\")
lines.append(r"\midrule")
for r in hard_rows:
    ep = r[0].replace("_", r"\_")
    lines.append(rf"\texttt{{{ep}}} & {r[1]} & {r[2].replace('_', ' ')} \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
open(os.path.join(OUT, "tab_worlds_hard.tex"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("tab_world_dist.tex", len(dist_rows), "rows;", "tab_worlds_hard.tex", len(hard_rows), "rows")

# --- calibration (section 4) ---
sec4 = MD.split("## 4.")[1]
cal_rows = [r for r in md_rows(sec4)[1:] if len(r) == 6 and r[0] != "Model"]
lines = [r"\begin{tabular}{lrrrrr}"]
lines.append(r"\toprule")
lines.append(r"Model & AUC & Brier & ECE & mean conf. & accuracy \\")
lines.append(r"\midrule")
for r in cal_rows:
    lines.append(rf"{r[0]} & {r[1]} & {r[2]} & {r[3]} & {r[4]} & {r[5]} \\")
lines.append(r"\bottomrule")
lines.append(r"\end{tabular}")
open(os.path.join(OUT, "tab_calibration.tex"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("tab_calibration.tex", len(cal_rows), "rows")

print("ALL TABLES DONE")
