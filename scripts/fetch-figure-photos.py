#!/usr/bin/env python3
"""12·3 내란 재판 피고인 프로필 사진 수집·최적화 스크립트.

scripts/figure-photos.json 의 목록(원본 URL·출처·검증 근거)을 따라 사진을 내려받아
얼굴 중심 1:1 크롭 후 160x160 / 320x320 WebP 로 저장한다.

    python3 scripts/fetch-figure-photos.py            # 내려받기 + 변환
    python3 scripts/fetch-figure-photos.py --cached DIR  # 이미 받아 둔 원본을 DIR 에서 읽는다
    python3 scripts/fetch-figure-photos.py --only chojh kimbs

결과물
    public/assets/photos/{id}-160.webp   관계도 노드(44px)·모바일용
    public/assets/photos/{id}-320.webp   상세 모달용

사진을 넣는 기준은 '본인 확인'이다. 목록의 verify 항목은 서로 다른 언론사(또는 정부 기관)
보도에서 이름·직책이 붙은 캡션으로 같은 얼굴이 확인된 근거를 적어 둔 것이며,
두 출처로 확인되지 않은 인물은 목록에 넣지 않고 이니셜 모노그램으로 남긴다.
"""
import argparse
import io
import json
import os
import sys
import urllib.request

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "scripts", "figure-photos.json")
OUT_DIR = os.path.join(ROOT, "public", "assets", "photos")
MODEL = os.path.join(ROOT, "scripts", "models", "face_detection_yunet_2023mar.onnx")
SIZES = (160, 320)
QUALITY = 82
UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}

Image.MAX_IMAGE_PIXELS = 200_000_000
_DETECTOR = None


def detect_face(im):
    """가장 큰 얼굴 상자 (x, y, w, h). 검출기가 없거나 실패하면 None."""
    global _DETECTOR
    if not os.path.exists(MODEL):
        return None
    try:
        import cv2
        import numpy as np

        if _DETECTOR is None:
            _DETECTOR = cv2.FaceDetectorYN.create(MODEL, "", (320, 320), 0.6, 0.3, 5000)
        small = im.copy()
        small.thumbnail((640, 640))
        w, h = small.size
        arr = np.array(small.convert("RGB"))[:, :, ::-1].copy()
        _DETECTOR.setInputSize((w, h))
        _, faces = _DETECTOR.detect(arr)
        if faces is None or len(faces) == 0:
            return None
        x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])[:4]
        scale = im.width / w
        return (x * scale, y * scale, fw * scale, fh * scale)
    except Exception as exc:  # 검출 실패해도 수집은 계속한다
        print(f"    얼굴 검출 실패({exc}) — 중앙 크롭으로 대체", file=sys.stderr)
        return None


def square_crop(im, face, zoom=2.0, shift_x=0.0):
    """얼굴 중심 1:1 크롭. 정수리 위 여백을 남기고 어깨까지 조금 넣는다."""
    im = ImageOps.exif_transpose(im).convert("RGB")
    w, h = im.size
    if face:
        fx, fy, fw, fh = face
        side = min(max(fw, fh) * zoom, min(w, h))
        left = fx - side / 2 + shift_x * side
        top = fy - fh * 0.8
        # 사진 밖으로 나가지 않게 민다
        left = max(0, min(w - side, left))
        top = max(0, min(h - side, top))
        return im.crop((int(left), int(top), int(left + side), int(top + side)))
    side = min(w, h)
    left = (w - side) // 2
    top = max(0, int((h - side) * 0.12))
    return im.crop((left, top, left + side, top + side))


def fetch(url: str, cache_dir: str):
    name = url.rsplit("/", 1)[-1].split("?")[0]
    cached = os.path.join(cache_dir, name) if cache_dir else ""
    if cached and os.path.exists(cached):
        return open(cached, "rb").read()
    req = urllib.request.Request(url, headers=UA)
    raw = urllib.request.urlopen(req, timeout=45).read()
    if cached:
        os.makedirs(cache_dir, exist_ok=True)
        with open(cached, "wb") as fh:
            fh.write(raw)
    return raw


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cached", help="원본을 읽어 올 캐시 디렉터리")
    ap.add_argument("--only", nargs="*", help="지정한 id 만 처리")
    args = ap.parse_args()

    items = json.load(open(MANIFEST, encoding="utf-8"))["photos"]
    os.makedirs(OUT_DIR, exist_ok=True)
    done, failed = 0, []
    for item in items:
        pid = item["id"]
        if args.only and pid not in args.only:
            continue
        if not item.get("photoUrl"):
            # 사용자 제공 이미지(원본 URL 없음)는 다시 받을 수 없으므로 건너뛴다.
            print(f"  {pid} {item['name']}: 사용자 제공 이미지 — 원본 URL 이 없어 건너뜁니다")
            continue
        try:
            im = Image.open(io.BytesIO(fetch(item["photoUrl"], args.cached)))
            im.load()
            box = item.get("crop")
            if box:
                w, h = im.size
                im = im.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))
            face = detect_face(im)
            square = square_crop(im, face, item.get("zoom", 2.0), item.get("shiftX", 0.0))
            for size in SIZES:
                out = square.resize((size, size), Image.LANCZOS)
                out.save(os.path.join(OUT_DIR, f"{pid}-{size}.webp"), format="WEBP",
                         quality=QUALITY, method=6)
            done += 1
            print(f"  {pid} {item['name']}: {'얼굴 검출' if face else '중앙 크롭'} "
                  f"{im.size[0]}x{im.size[1]} -> 160/320")
        except Exception as exc:
            failed.append((pid, str(exc)))
            print(f"  {pid} 실패: {exc}", file=sys.stderr)
    print(f"완료 {done}명, 실패 {len(failed)}명")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
