#!/usr/bin/env python3
"""오프라인 단일 파일(public/insurrection-trials-offline.html)을 만든다.

public/index.html 은 온라인 배포본이라 CSS·JS 를 styles.css · core.js · app.js 로 나눠 링크하고,
데이터셋 JSON 도 fetch 로만 읽는다(내장 사본 없음).
이 스크립트는 그 세 파일을 HTML 안에 인라인하고, 사본에만 데이터를 내장한다.

  1. styles.css → <style> 블록으로, core.js · app.js → <script> 블록으로 인라인
  2. `const EMBEDDED={};` 뒤에 EMBEDDED.dec03 / kim / chae 세 재판 기록부 JSON 을 넣는다.
  3. 탄핵 표결 뷰 JS 주석 앞에 `const IMP_EMBEDDED = {...};` 를 넣는다.
  4. `let OFFLINE_ONLY=false;` → true (fetch 를 시도하지 않는다)

결과물은 file:// 로 열어도 외부 CSS/JS 요청 없이 스위처의 네 기록부가 모두 동작한다.
public/index.html · styles.css · core.js · app.js 는 읽기만 하고 이 스크립트가 수정하지 않는다.

파일을 고친 뒤에는 항상 이 스크립트를 실행한다.

    python3 scripts/build-offline.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
INDEX = PUBLIC / "index.html"
STYLES = PUBLIC / "styles.css"
CORE = PUBLIC / "core.js"
APP = PUBLIC / "app.js"
OFFLINE = PUBLIC / "insurrection-trials-offline.html"

# index.html 이 링크하는 태그 → 인라인할 파일
CSS_TAG = '<link rel="stylesheet" href="styles.css">'
CORE_TAG = '<script src="core.js"></script>'
APP_TAG = '<script src="app.js"></script>'

# 스위처 순서대로. (내장 블록 이름, 원본 JSON)
DATASETS = [
    ("dec03", PUBLIC / "insurrection-trials-data.json"),
    ("kim", PUBLIC / "kim-trials-data.json"),
    ("chae", PUBLIC / "chae-trials-data.json"),
]
IMP_DATA = PUBLIC / "impeachment-assembly-data.json"
# 내장 데이터를 넣을 지점: app.js 의 빈 EMBEDDED 훅 바로 뒤
EMBED_ANCHOR = "const EMBEDDED={};"
# 오프라인 사본은 fetch 를 시도하지 않고 내장 데이터만 쓴다(file:// 에서 네트워크 오류 없음)
OFFLINE_FLAG = "let OFFLINE_ONLY=false;"
OFFLINE_FLAG_ON = "let OFFLINE_ONLY=true;"
# 탄핵 표결 뷰 JS 블록 시작 주석. CSS 에도 같은 문구가 있으므로 반드시 app.js 안에서 찾는다.
MARK = "/* ===== 22대 국회 탄핵 표결 뷰 ===== */"


def compact(data) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def count(text: str, needle: str) -> int:
    return text.count(needle)


def inline(html: str, tag: str, path: Path, wrapper: str) -> str:
    if count(html, tag) != 1:
        sys.exit(f"index.html 에서 {tag} 를 한 곳에서 찾지 못했습니다 ({count(html, tag)}곳)")
    body = path.read_text(encoding="utf-8").strip("\n")
    if wrapper == "style" and "</style>" in body:
        sys.exit(f"{path.name} 에 </style> 문자열이 있어 인라인할 수 없습니다")
    if wrapper == "script" and "</script" in body:
        sys.exit(f"{path.name} 에 </script 문자열이 있어 인라인할 수 없습니다")
    return html.replace(tag, f"<{wrapper}>\n{body}\n</{wrapper}>", 1)


def main() -> None:
    html = INDEX.read_text(encoding="utf-8")
    app = APP.read_text(encoding="utf-8")

    # 온라인 배포본에 내장 JSON 이 다시 들어가면 오프라인 빌드의 전제가 깨진다.
    for name, _ in DATASETS:
        if f"EMBEDDED.{name}=" in app:
            sys.exit(f"app.js 에 내장 데이터(EMBEDDED.{name})가 남아 있습니다. 온라인 배포본은 fetch 전용입니다.")

    if count(app, EMBED_ANCHOR) != 1:
        sys.exit(f"app.js 에서 내장 지점({EMBED_ANCHOR})을 한 곳에서 찾지 못했습니다")
    if count(app, OFFLINE_FLAG) != 1:
        sys.exit(f"app.js 에서 오프라인 플래그({OFFLINE_FLAG})를 한 곳에서 찾지 못했습니다")
    if count(app, MARK) != 1:
        sys.exit(f"app.js 에서 탄핵 표결 뷰 주석을 한 곳에서 찾지 못했습니다")

    # 1) app.js 안에 데이터·플래그를 넣는다(인라인 전에 처리해 CSS 쪽 주석과 섞이지 않게 한다).
    embedded = "".join(
        f"\nEMBEDDED.{name}={compact(json.loads(path.read_text(encoding='utf-8')))};"
        for name, path in DATASETS
    )
    app = app.replace(EMBED_ANCHOR, EMBED_ANCHOR + embedded, 1)
    app = app.replace(OFFLINE_FLAG, OFFLINE_FLAG_ON, 1)

    imp = json.loads(IMP_DATA.read_text(encoding="utf-8"))
    app = app.replace(MARK, f"const IMP_EMBEDDED = {compact(imp)};\n" + MARK, 1)

    # 2) CSS·JS 를 HTML 에 인라인한다.
    out = inline(html, CSS_TAG, STYLES, "style")
    out = inline(out, CORE_TAG, CORE, "script")
    if count(out, APP_TAG) != 1:
        sys.exit(f"index.html 에서 {APP_TAG} 를 한 곳에서 찾지 못했습니다 ({count(out, APP_TAG)}곳)")
    body = app.strip("\n")
    if "</script" in body:
        sys.exit("app.js 에 </script 문자열이 있어 인라인할 수 없습니다")
    out = out.replace(APP_TAG, f"<script>\n{body}\n</script>", 1)

    # 3) 인라인 후에도 바깥 파일을 가리키는 참조가 남아 있으면 단일 파일이 아니다.
    for leftover in ('href="styles.css"', 'src="core.js"', 'src="app.js"', 'href="app.js"', 'href="core.js"'):
        if leftover in out:
            sys.exit(f"오프라인 사본에 외부 참조가 남아 있습니다: {leftover}")

    OFFLINE.write_text(out, encoding="utf-8")
    print(
        f"  {OFFLINE.name} 생성 · CSS {len(STYLES.read_text(encoding='utf-8').encode('utf-8')):,}B · "
        f"JS {len(body.encode('utf-8')):,}B · 재판 데이터 {len(DATASETS)}종 · "
        f"탄핵 표결 {len(imp.get('members', []))}명 내장 "
        f"({len(out.encode('utf-8')):,}바이트) · index.html 은 수정하지 않음"
    )


if __name__ == "__main__":
    main()
