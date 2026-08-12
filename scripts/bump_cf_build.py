#!/usr/bin/env python3
"""Bump cf-build / ?v= cache-bust tags in app.html after SOC data updates."""
from __future__ import annotations

import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_HTML = ROOT / "app.html"


def bump(build_id: str | None = None) -> str:
    build = build_id or f"soc-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    text = APP_HTML.read_text(encoding="utf-8")
    text, n_meta = re.subn(
        r'(<meta name="cf-build" content=")[^"]+(")',
        rf"\1{build}\2",
        text,
        count=1,
    )
    text, n_v = re.subn(r"\?v=[^\"']+", f"?v={build}", text)
    if n_meta != 1:
        raise SystemExit(f"Expected one cf-build meta tag, updated {n_meta}")
    if n_v < 1:
        raise SystemExit("No ?v= cache-bust query strings found in app.html")
    APP_HTML.write_text(text, encoding="utf-8")
    return build


if __name__ == "__main__":
    bid = sys.argv[1] if len(sys.argv) > 1 else None
    print(bump(bid))
