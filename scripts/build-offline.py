#!/usr/bin/env python3
"""오프라인 단일 파일(public/insurrection-trials-offline.html)을 만든다.

실제 빌드는 scripts/offline-build.mjs (Node) 가 한다. 이 스크립트는 예전 명령

    python3 scripts/build-offline.py

을 그대로 쓸 수 있도록 그 빌더를 호출하는 얇은 래퍼다.

빌드 로직을 Node 한 곳에만 두는 이유: `npm run validate`(CI)가 같은 빌더로 사본을 다시 만들어
커밋된 파일과 바이트 단위로 비교하기 때문이다. CI 에는 Python 이 보장되지 않고, 두 곳에 같은
로직을 두면 한쪽만 고쳐져 사본이 조용히 어긋난다.

    python3 scripts/build-offline.py      # = npm run build:offline
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILDER = ROOT / "scripts" / "offline-build.mjs"


def main() -> int:
    node = shutil.which("node")
    if not node:
        print(
            "node 를 찾지 못했습니다. Node 20 이상을 설치한 뒤 `npm run build:offline` 또는 "
            "`node scripts/offline-build.mjs --write` 를 실행하세요.",
            file=sys.stderr,
        )
        return 1
    return subprocess.call([node, str(BUILDER), "--write"])


if __name__ == "__main__":
    sys.exit(main())
