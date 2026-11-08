#!/usr/bin/env python3
"""22대 국회의원 공식 프로필 사진 수집·최적화 스크립트.

열린국회정보 OpenAPI(ALLNAMEMBER)에서 이름으로 의원을 조회해 제22대 항목의
NAAS_PIC(국회 공식 프로필 사진 URL)을 얻고, Pillow 로 1:1 정사각형(얼굴 중심)
크롭 후 120x120 WebP(quality=82)로 저장한다.

    python3 scripts/fetch-member-photos.py            # 내려받기 + 변환 + 데이터 갱신
    python3 scripts/fetch-member-photos.py --check    # 데이터 갱신 없이 수집 결과만 확인

결과물
    public/assets/members/{id}.webp   301명 프로필 (약 4~6KB/명)
    public/impeachment-assembly-data.json  각 의원에 "photo" 필드 추가
    scripts/member-photos.json        이름·원본 URL·파일 크기 기록(재현용)
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.parse
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 200_000_000  # 국회 원본 중 1억 픽셀대 스캔이 있다

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "public", "impeachment-assembly-data.json")
OUT_DIR = os.path.join(ROOT, "public", "assets", "members")
MANIFEST = os.path.join(ROOT, "scripts", "member-photos.json")

API = "https://open.assembly.go.kr/portal/openapi/ALLNAMEMBER"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
SIZE = 120
QUALITY = 82

# 얼굴 검출 모델(OpenCV YuNet, 232KB). 없으면 상단 정사각형 크롭으로 대체한다.
#   curl -L -o scripts/models/face_detection_yunet_2023mar.onnx \
#     https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
MODEL = os.environ.get("YUNET_MODEL") or os.path.join(ROOT, "scripts", "models", "face_detection_yunet_2023mar.onnx")
_DETECTOR = None
_DETECT_LOCK = threading.Lock()  # OpenCV 검출기는 스레드 안전하지 않아 한 번에 하나만 쓴다


def http_get(url: str, timeout: int = 40) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://open.assembly.go.kr/"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read()


def lookup_photo(name: str) -> tuple[str, str]:
    """이름 -> (제22대 NAAS_PIC URL, NAAS_CD). 없으면 ("", "")."""
    url = f"{API}?Type=json&pIndex=1&pSize=5&NAAS_NM={urllib.parse.quote(name)}"
    data = json.loads(http_get(url).decode("utf-8"))
    rows = []
    for block in data.get("ALLNAMEMBER", []):
        rows.extend(block.get("row", []))
    for row in rows:
        if row.get("NAAS_NM") == name and "제22대" in (row.get("GTELT_ERACO") or ""):
            return (row.get("NAAS_PIC") or "").strip(), (row.get("NAAS_CD") or "").strip()
    return "", ""


def detect_face(im: Image.Image):
    """(fx, fy, fw, fh) 얼굴 상자. 모델이 없거나 검출 실패면 None."""
    global _DETECTOR
    if _DETECTOR is False:
        return None
    if _DETECTOR is None:
        path = MODEL
        if not path or not os.path.exists(path):
            _DETECTOR = False
            return None
        import cv2

        _DETECTOR = cv2.FaceDetectorYN.create(path, "", (320, 320), 0.6, 0.3, 5000)
    try:
        import cv2
        import numpy as np

        small = im.copy()
        small.thumbnail((480, 600))
        w, h = small.size
        arr = np.array(small.convert("RGB"))[:, :, ::-1].copy()
        with _DETECT_LOCK:
            _DETECTOR.setInputSize((w, h))
            _, faces = _DETECTOR.detect(arr)
        if faces is None or len(faces) == 0:
            return None
        x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])[:4]
        scale = im.width / w
        return ((x + fw / 2) * scale, (y + fh / 2) * scale, fw * scale, fh * scale)
    except Exception as exc:  # 검출을 못 해도 수집은 계속한다
        print(f"    얼굴 검출 실패({exc}) — 상단 정사각형으로 자름", file=sys.stderr)
        return None


def head_top(im: Image.Image, face) -> int:
    """얼굴 상자 위쪽에서 머리카락 끝(정수리)의 y 를 찾는다.

    공식 프로필은 배경이 단색이라, 얼굴 중심 열에서 배경색과 달라지는 첫 행을 정수리로 본다.
    배경이 복잡하거나 검출에 실패하면 얼굴 상자 기준 추정값을 쓴다.
    """
    import numpy as np

    fx, fy, fw, fh = face
    arr = np.asarray(im.convert("RGB"), dtype=np.int16)
    h, w = arr.shape[:2]
    # 배경색: 위쪽 모서리 두 곳의 중앙값
    patch = 12
    corners = [
        arr[0:patch, 0:patch].reshape(-1, 3),
        arr[0:patch, max(0, w - patch):w].reshape(-1, 3),
    ]
    bg = np.median(np.concatenate(corners), axis=0)
    x0, x1 = int(max(0, fx - fw * 0.18)), int(min(w - 1, fx + fw * 0.18))
    box_top = int(max(0, fy - fh / 2))
    limit = max(0, int(box_top - fh * 0.7))
    found = None
    miss = 0
    for y in range(box_top, limit, -1):
        band = arr[y, x0 : x1 + 1]
        diff = np.abs(band - bg).max(axis=1)
        if diff.min() > 30:  # 이 줄에 배경과 뚜렷이 다른 픽셀이 있다 = 머리카락
            found = y
            miss = 0
        else:
            miss += 1
            if miss >= 4 and found is not None:
                break
    estimate = int(fy - fh * 0.85)
    if found is None:
        return estimate
    # 검출값이 얼굴 상자 바로 위에 붙어 있으면(배경과 머리카락 색이 비슷한 사진) 추정값을 쓴다.
    return min(found, max(estimate, int(fy - fh * 0.5 - fh * 0.35)))


def square_crop(im: Image.Image) -> Image.Image:
    """공식 프로필 사진을 1:1로 자른다.

    정수리 위에 약간의 여백만 남기고(머리카락이 잘리지 않게) 상단 기준으로 자른다.
    """
    # 일부 원본은 1억 픽셀을 넘는 고해상 스캔이라, JPEG 은 디코딩 단계에서 줄여 메모리를 아낀다.
    try:
        im.draft("RGB", (SIZE * 4, SIZE * 5))
    except Exception:
        pass
    im = ImageOps.exif_transpose(im).convert("RGB")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = 0
    face = detect_face(im)
    if face:
        fx, fy, fw, fh = face
        top = head_top(im, face) - int(side * 0.04)
        left = int(fx - side / 2)
    top = max(0, min(h - side, top))
    left = max(0, min(w - side, left))
    return im.crop((left, top, left + side, top + side))


def to_webp_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.resize((SIZE, SIZE), Image.LANCZOS).save(buf, format="WEBP", quality=QUALITY, method=6)
    return buf.getvalue()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="데이터 JSON 은 건드리지 않는다")
    ap.add_argument("--force", action="store_true", help="이미 받은 사진도 다시 받는다")
    args = ap.parse_args()

    data = json.load(open(DATA, encoding="utf-8"))
    members = data["members"]
    os.makedirs(OUT_DIR, exist_ok=True)

    manifest = {}
    if os.path.exists(MANIFEST):
        manifest = json.load(open(MANIFEST, encoding="utf-8")).get("members", {})

    todo = []
    for m in members:
        mid, name = m["id"], m["name"]
        dest = os.path.join(OUT_DIR, f"{mid}.webp")
        record = manifest.get(mid) or {}
        if os.path.exists(dest) and not args.force and record.get("name") == name and record.get("url"):
            m["photo"] = f"assets/members/{mid}.webp"
            continue
        todo.append(m)
    print(f"대상 {len(todo)}명 (이미 받은 사진 {len(members) - len(todo)}명은 건너뜀)")
    by_id = {m["id"]: m for m in members}

    missing, failed = [], []

    def fetch_one(m):
        mid, name = m["id"], m["name"]
        dest = os.path.join(OUT_DIR, f"{mid}.webp")
        try:
            pic, code = lookup_photo(name)
            if not pic:
                return (mid, name, "api", "API 에 22대 사진 없음")
            raw = http_get(pic)
            im = Image.open(io.BytesIO(raw))
            w, h = im.size
            out = to_webp_bytes(square_crop(im))
            with open(dest, "wb") as fh:
                fh.write(out)
            return (mid, name, "ok", {
                "name": name,
                "naasCd": code,
                "url": pic,
                "source": f"{w}x{h}",
                "bytes": len(out),
            })
        except Exception as exc:  # 다운로드·변환 실패는 건너뛰고 이니셜 폴백에 맡긴다
            return (mid, name, "fail", str(exc))

    done = 0
    with ThreadPoolExecutor(6) as pool:
        for mid, name, kind, info in pool.map(fetch_one, todo):
            done += 1
            if kind == "ok":
                manifest[mid] = info
                by_id[mid]["photo"] = f"assets/members/{mid}.webp"
                print(f"  [{done:3d}/{len(todo)}] {name}: {info['source']} -> {info['bytes'] // 1024}KB")
            elif kind == "api":
                missing.append((mid, name))
                print(f"  [{done:3d}/{len(todo)}] {name}: {info}", file=sys.stderr)
            else:
                failed.append((mid, name, info))
                print(f"  [{done:3d}/{len(todo)}] {name}: 실패 {info}", file=sys.stderr)

    # 사진이 없는 의원은 photo 필드를 두지 않는다(프런트는 이니셜로 폴백).
    for m in members:
        if not os.path.exists(os.path.join(OUT_DIR, f"{m['id']}.webp")):
            m.pop("photo", None)

    total = sum(v.get("bytes", 0) for v in manifest.values())
    print(f"\n수집 완료: {sum(1 for m in members if m.get('photo'))}/301명, "
          f"파일 용량 {total / 1024 / 1024:.2f}MB")
    if missing:
        print(f"사진 없음 {len(missing)}명: " + ", ".join(n for _, n in missing), file=sys.stderr)
    if failed:
        print(f"실패 {len(failed)}명: " + ", ".join(f"{n}({e})" for _, n, e in failed), file=sys.stderr)

    if args.check:
        return 0 if not missing and not failed else 1

    if not missing and not failed:
        data["meta"]["photos"] = {
            "source": "대한민국 국회 열린국회정보 OpenAPI (ALLNAMEMBER · NAAS_PIC)",
            "license": "공공누리 제1유형(출처 표시)",
            "note": "국회 공식 프로필 사진을 1:1 크롭해 120x120 WebP로 최적화했습니다.",
        }
    with open(DATA, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump({"updatedAt": time.strftime("%Y-%m-%d"), "members": manifest}, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"데이터 갱신: {os.path.relpath(DATA, ROOT)}, 기록: {os.path.relpath(MANIFEST, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
