#!/usr/bin/env python3
"""오프라인 단일 파일(public/insurrection-trials-offline.html)을 만든다.

public/index.html 은 온라인 배포본이라 데이터셋 JSON 을 fetch 로만 읽는다(내장 사본 없음).
이 스크립트는 index.html 을 그대로 복사하면서 사본에만 데이터를 내장한다.

  1. `const EMBEDDED={};` 뒤에 EMBEDDED.dec03 / kim / chae 세 재판 기록부 JSON 을 넣는다.
  2. 탄핵 표결 뷰 JS 주석 앞에 `const IMP_EMBEDDED = {...};` 를 넣는다.

이렇게 하면 파일을 직접 열어도(file://) 스위처의 네 기록부가 모두 동작한다.
public/index.html 은 읽기만 하고 이 스크립트가 수정하지 않는다.

index.html 이나 데이터 JSON 을 고친 뒤에는 항상 이 스크립트를 실행한다.

    python3 scripts/build-offline.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
INDEX = PUBLIC / "index.html"
OFFLINE = PUBLIC / "insurrection-trials-offline.html"

# 스위처 순서대로. (index.html 내장 블록 이름, 원본 JSON)
DATASETS = [
    ("dec03", PUBLIC / "insurrection-trials-data.json"),
    ("kim", PUBLIC / "kim-trials-data.json"),
    ("chae", PUBLIC / "chae-trials-data.json"),
]
IMP_DATA = PUBLIC / "impeachment-assembly-data.json"
# 내장 데이터를 넣을 지점: index.html 의 빈 EMBEDDED 훅 바로 뒤
EMBED_ANCHOR = "const EMBEDDED={};"
# 오프라인 사본은 fetch 를 시도하지 않고 내장 데이터만 쓴다(file:// 에서 네트워크 오류 없음)
OFFLINE_FLAG = "let OFFLINE_ONLY=false;"
OFFLINE_FLAG_ON = "let OFFLINE_ONLY=true;"
# CSS 주석과 JS 주석에 같은 문구가 한 번씩 나온다. 스크립트 실행 중 render() 가 불리므로
# 내장 탄핵 데이터는 반드시 JS 주석(두 번째) 앞, 즉 최상위 스코프 초기에 놓는다.
MARK = "/* ===== 22대 국회 탄핵 표결 뷰 ===== */"


def compact(data) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    html = INDEX.read_text(encoding="utf-8")

    # 온라인 배포본에 내장 JSON 이 다시 들어가면 오프라인 빌드의 전제가 깨진다.
    for name, _ in DATASETS:
        if f"EMBEDDED.{name}=" in html:
            sys.exit(f"index.html 에 내장 데이터(EMBEDDED.{name})가 남아 있습니다. 온라인 배포본은 fetch 전용입니다.")

    if html.count(EMBED_ANCHOR) != 1:
        sys.exit(f"index.html 에서 내장 지점({EMBED_ANCHOR})을 한 곳에서 찾지 못했습니다")

    embedded = "".join(
        f"\nEMBEDDED.{name}={compact(json.loads(path.read_text(encoding='utf-8')))};"
        for name, path in DATASETS
    )
    out = html.replace(EMBED_ANCHOR, EMBED_ANCHOR + embedded, 1)

    if out.count(OFFLINE_FLAG) != 1:
        sys.exit(f"index.html 에서 오프라인 플래그({OFFLINE_FLAG})를 한 곳에서 찾지 못했습니다")
    out = out.replace(OFFLINE_FLAG, OFFLINE_FLAG_ON, 1)

    imp = json.loads(IMP_DATA.read_text(encoding="utf-8"))
    first = out.find(MARK)
    if first < 0:
        sys.exit("index.html 에서 탄핵 표결 뷰 주석을 찾지 못했습니다")
    second = out.find(MARK, first + len(MARK))
    if second < 0:
        sys.exit("index.html 의 JS 탄핵 표결 뷰 주석(두 번째)을 찾지 못했습니다")
    out = out[:second] + f"const IMP_EMBEDDED = {compact(imp)};\n" + out[second:]

    OFFLINE.write_text(out, encoding="utf-8")
    print(
        f"  {OFFLINE.name} 생성 · 재판 데이터 {len(DATASETS)}종 · "
        f"탄핵 표결 {len(imp.get('members', []))}명 내장 "
        f"({len(out.encode('utf-8')):,}바이트) · index.html 은 수정하지 않음"
    )


if __name__ == "__main__":
    main()
