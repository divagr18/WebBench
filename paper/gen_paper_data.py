"""Build the paper's field dataset (paper_data.json).

Field = 10 configurations; Luna's field entry is the low-effort pilot
(the no-reasoning pilot stays out of the field and feeds only the effort
analysis). Analysis dashboard artifacts are left untouched.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "analysis"))
from gen_dashboard_data import build_entry

PAPER_PILOTS = [
    ("pilot-dev-v2", "deepseek-chat"),
    ("pilot-dev-v2-openai-low", "gpt-5.6-luna"),
    ("pilot-dev-v2-modelscope-max", "qwen3.7-max"),
    ("pilot-dev-v2-modelscope-plus", "qwen3.7-plus"),
    ("pilot-gemini-37", "gemini-3.7-fl"),
    ("pilot-gemini-35-lite", "gemini-3.5-lite"),
    ("pilot-terra-80", "gpt-5.6-terra"),
    ("pilot-muse-80", "muse"),
    ("pilot-grok-80", "grok"),
    ("pilot-sol-50", "gpt-5.6-sol"),
]

data = {}
for runset, model_id in PAPER_PILOTS:
    data[model_id] = build_entry(runset)

out = Path(__file__).resolve().parent / "paper_data.json"
out.write_text(json.dumps(data, indent=2), encoding="utf-8")
print(f"wrote {out.name}: {len(data)} field configurations")
print("luna field EAS:", round(data["gpt-5.6-luna"]["eas"], 4))
