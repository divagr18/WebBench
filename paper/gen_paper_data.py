"""Build the paper's per-model dataset (paper_data.json) from the canonical
run manifest (run_manifest.json), replacing the formerly hand-maintained,
divergent PAPER_PILOTS/PILOTS lists in this file, analysis/gen_dashboard_data.py,
analysis/cross_model_analysis.py, and analysis/export_glm_dashboard.py.

Emits one entry per *available* manifest model (any role), each tagged with
its manifest role and runSet, so downstream scripts can filter to field-only
for headline/full-matrix tables while still supporting effort-/route-appendix
analyses from the same file. Models still marked 'missing' in the manifest
are skipped (not silently substituted with a different variant).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "analysis"))
from gen_dashboard_data import build_entry

from validate_manifest import load_manifest, report_files_present

manifest = load_manifest()
data = {}
skipped = []
for m in manifest["models"]:
    if m["status"] != "available":
        skipped.append(m["modelId"])
        continue
    if not report_files_present(m["runSet"]):
        raise RuntimeError(
            f"manifest says {m['modelId']} ({m['runSet']}) is available but its report "
            f"files are missing on disk -- run validate_manifest.py first"
        )
    entry = build_entry(m["runSet"])
    entry["modelId"] = m["modelId"]
    entry["displayName"] = m["displayName"]
    entry["role"] = m["role"]
    data[m["modelId"]] = entry

out = Path(__file__).resolve().parent / "paper_data.json"
out.write_text(json.dumps(data, indent=2), encoding="utf-8")
field_n = sum(1 for e in data.values() if e["role"] == "field")
print(f"wrote {out.name}: {len(data)} available models ({field_n} field-eligible-role, "
      f"{len(data) - field_n} appendix-role), {len(skipped)} skipped as missing: {skipped}")
