"""One command, clean checkout to regenerated tables/figures:

    python paper/build_paper.py

Runs, in order, failing fast at the first problem instead of leaving partial
output: validate_manifest -> gen_paper_data -> cross_field -> gen_tables ->
gen_figures. Records an input hash in paper/build/pipeline_lock.json so a
rerun with unchanged inputs (manifest + every available report's
score-report.json/runs.csv) is a no-op, and any change forces full
regeneration of every downstream artifact. Pass --force to regenerate
regardless of the lock.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
LOCK_DIR = HERE / "build"
LOCK_PATH = LOCK_DIR / "pipeline_lock.json"

STAGES = [
    ("validate_manifest", ["validate_manifest.py"]),
    ("gen_paper_data", ["gen_paper_data.py"]),
    ("cross_field", ["cross_field.py"]),
    ("gen_tables", ["gen_tables.py"]),
    ("gen_figures", ["gen_figures.py"]),
]


def input_hash() -> str:
    sys.path.insert(0, str(HERE))
    from validate_manifest import load_manifest, report_dir  # noqa: E402

    manifest = load_manifest()
    h = hashlib.sha256()
    h.update(json.dumps(manifest, sort_keys=True).encode("utf-8"))
    for m in manifest["models"]:
        if m["status"] != "available":
            continue
        d = report_dir(m["runSet"])
        for fname in ("score-report.json", "runs.csv"):
            p = d / fname
            if p.is_file():
                h.update(p.read_bytes())
    return h.hexdigest()


def run_stage(label: str, argv: list) -> None:
    print(f"\n=== {label} ===", flush=True)
    result = subprocess.run([sys.executable, *[str(HERE / a) for a in argv]], cwd=str(HERE))
    if result.returncode != 0:
        print(f"\n[build_paper] FAILED at stage '{label}' (exit {result.returncode}) -- stopping, "
              f"no downstream stage ran, nothing partial was left claiming to be complete.")
        sys.exit(result.returncode)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate even if the input hash matches the lock")
    args = ap.parse_args()

    current_hash = input_hash()
    LOCK_DIR.mkdir(parents=True, exist_ok=True)
    prior = json.loads(LOCK_PATH.read_text(encoding="utf-8")) if LOCK_PATH.is_file() else None

    if not args.force and prior and prior.get("inputHash") == current_hash:
        print(f"[build_paper] inputs unchanged (hash {current_hash[:12]}...) -- nothing to do. Pass --force to rebuild anyway.")
        return 0

    for label, argv in STAGES:
        run_stage(label, argv)

    LOCK_PATH.write_text(json.dumps({
        "inputHash": current_hash,
        "stages": [label for label, _ in STAGES],
    }, indent=2), encoding="utf-8")
    print(f"\n[build_paper] ALL STAGES COMPLETE. Wrote {LOCK_PATH.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
