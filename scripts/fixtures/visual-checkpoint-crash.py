"""Test-only exact temporary workspace: stop after the first durable OCR checkpoint."""
from pathlib import Path
import importlib.util
import os
import sys
import time

root = Path.cwd().resolve()
source = Path(sys.argv[sys.argv.index("--input") + 1]).resolve()
checkpoint = Path(sys.argv[sys.argv.index("--checkpoint-dir") + 1]).resolve()
marker = source.parent / "checkpoint-committed.marker"
assert (root / "tmp") in source.parents and checkpoint.parent == source.parent
spec = importlib.util.spec_from_file_location("visual", root / "scripts/prepare_pptx_visual_review.py")
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
replace = os.replace
def stop_after_replace(before, after):
    result = replace(before, after)
    if checkpoint in Path(after).resolve().parents:
        marker.write_text(str(os.getpid()), encoding="ascii")
        time.sleep(120)
        raise RuntimeError("Parent did not kill probe")
    return result
module.os.replace = stop_after_replace
module.main()
