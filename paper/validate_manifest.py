"""Validate paper/run_manifest.json against reports/dev/ on disk.

First step of every pipeline invocation (see build_paper.py). Fails loudly
with a per-model itemized list -- not a generic FileNotFoundError -- in
either direction:
  - a model marked 'available' whose reports/dev/<runSet>/ directory (or its
    score-report.json/runs.csv) is missing on disk, or
  - a model marked 'missing' whose directory *has* now appeared on disk
    (the manifest is stale and should be flipped to 'available' + have its
    completedRuns/eas re-derived, so the pipeline doesn't silently keep
    treating newly-arrived data as absent).
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
REPORTS = REPO / "reports" / "dev"


def load_manifest(path=None):
    path = path or (HERE / "run_manifest.json")
    return json.loads(Path(path).read_text(encoding="utf-8"))


def report_dir(run_set: str) -> Path:
    return REPORTS / run_set


def report_files_present(run_set: str) -> bool:
    d = report_dir(run_set)
    return (d / "score-report.json").is_file() and (d / "runs.csv").is_file()


def validate(manifest):
    """Return a list of human-readable problem strings; empty = valid."""
    problems = []
    for m in manifest["models"]:
        present = report_files_present(m["runSet"])
        if m["status"] == "available" and not present:
            problems.append(
                f"{m['modelId']} ({m['displayName']}): manifest says 'available' at "
                f"runSet={m['runSet']!r}, but reports/dev/{m['runSet']}/score-report.json "
                f"and/or runs.csv is missing. Either the directory hasn't been supplied yet "
                f"(flip status to 'missing') or the runSet string is wrong."
            )
        elif m["status"] == "unrecoverable" and present:
            problems.append(
                f"{m['modelId']} ({m['displayName']}): manifest says 'unrecoverable', but "
                f"reports/dev/{m['runSet']}/ has score-report.json and runs.csv. Flip status "
                f"to 'available' and update its note."
            )
        elif m["status"] == "missing" and present:
            problems.append(
                f"{m['modelId']} ({m['displayName']}): manifest says 'missing', but "
                f"reports/dev/{m['runSet']}/ now has both score-report.json and runs.csv. "
                f"Flip status to 'available' in run_manifest.json (and re-check any "
                f"completedRuns/eas commentary in its 'note') before regenerating the paper."
            )
    return problems


def main() -> int:
    manifest = load_manifest()
    problems = validate(manifest)
    available = [m["modelId"] for m in manifest["models"] if m["status"] == "available"]
    missing = [m["modelId"] for m in manifest["models"] if m["status"] == "missing"]
    lost = [m["modelId"] for m in manifest["models"] if m["status"] == "unrecoverable"]
    print(f"[validate_manifest] {len(available)} available, {len(missing)} missing, {len(lost)} unrecoverable:")
    for mid in lost:
        print(f"  unrecoverable: {mid}")
    for mid in missing:
        print(f"  missing: {mid}")
    if problems:
        print(f"\n[validate_manifest] FAILED with {len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("[validate_manifest] OK -- manifest matches reports/dev/ on disk")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
