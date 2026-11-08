#!/usr/bin/env python3
"""재판·탄핵 기록부의 JSON 을 index.html 내장 데이터에 맞추고, 오프라인 단일 파일을 만든다.

하는 일
1. public/*.json 의 최신 내용을 index.html 의 `EMBEDDED.<ds> = {...};` 블록에 다시 쓴다.
   (첫 페인트가 내장 데이터로 그려지므로, 내장 사본이 오래되면 옛 내용이 먼저 보인다)
2. public/index.html 을 그대로 복사하면서 탄핵 표결 데이터(impeachment-assembly-data.json)를
   `const IMP_EMBEDDED = {...};` 로 내장해 public/insurrection-trials-offline.html 을 만든다.
   이렇게 하면 파일을 직접 열어도(file://) 스위처의 네 기록부가 모두 동작한다.

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

# 스위처 순서대로. (원본 JSON, index.html 내장 블록 이름)
DATASETS = [
    ("dec03", PUBLIC / "insurrection-trials-data.json"),
    ("kim", PUBLIC / "kim-trials-data.json"),
    ("chae", PUBLIC / "chae-trials-data.json"),
]
IMP_DATA = PUBLIC / "impeachment-assembly-data.json"
# CSS 주석과 JS 주석에 같은 문구가 한 번씩 나온다. 스크립트 실행 중 render() 가 불리므로
# 내장 데이터는 반드시 JS 주석(두 번째) 앞, 즉 최상위 스코프 초기에 놓는다.
MARK = "/* ===== 22대 국회 탄핵 표결 뷰 ===== */"


def compact(data) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def object_end(text: str, start: int) -> int:
    """text[start] == '{' 에서 시작하는 JSON 객체의 닫는 '}' 위치(포함)를 찾는다."""
    depth, i, in_str, esc = 0, start, False, False
    while i < len(text):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("JSON 객체의 끝을 찾지 못했습니다")


def refresh_embedded(html: str, name: str, data) -> str:
    head = f"EMBEDDED.{name}="
    at = html.find(head)
    if at < 0:
        sys.exit(f"index.html 에서 {head} 블록을 찾지 못했습니다")
    start = at + len(head)
    if html[start] != "{":
        sys.exit(f"{head} 뒤에 JSON 객체가 없습니다")
    end = object_end(html, start)
    return html[:start] + compact(data) + html[end + 1 :]


def main() -> None:
    html = INDEX.read_text(encoding="utf-8")
    for name, path in DATASETS:
        html = refresh_embedded(html, name, json.loads(path.read_text(encoding="utf-8")))

    imp = json.loads(IMP_DATA.read_text(encoding="utf-8"))
    first = html.find(MARK)
    if first < 0:
        sys.exit("index.html 에서 탄핵 표결 뷰 주석을 찾지 못했습니다")
    second = html.find(MARK, first + len(MARK))
    if second < 0:
        sys.exit("index.html 의 JS 탄핵 표결 뷰 주석(두 번째)을 찾지 못했습니다")

    out = html[:second] + f"const IMP_EMBEDDED = {compact(imp)};\n" + html[second:]

    INDEX.write_text(html, encoding="utf-8")
    OFFLINE.write_text(out, encoding="utf-8")
    print(
        f"  index.html 내장 데이터 {len(DATASETS)}종 갱신 · "
        f"{OFFLINE.name} 생성({len(out):,}자, 탄핵 표결 {len(imp.get('members', []))}명 내장)"
    )


if __name__ == "__main__":
    main()
