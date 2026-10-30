#!/usr/bin/env python3
"""Gallery previews, made from gallery/works.json:

  gallery/thumbs/<file>.700.webp    700 px wide, what the feed shows
  gallery/thumbs/<file>.1200.webp   up to 1200 px on the long side, for big and sharp screens
  gallery/thumbs/sizes.json         width and height of the 700 version, so the page keeps the space

Only what is missing gets made, so it is safe to run again and again: the GitHub Action
(.github/workflows/gallery-thumbs.yml) runs it whenever the Mindgate bot adds a work.
Run from the repository root:  python3 tools/gallery_thumbs.py
"""
import io
import json
import os

from PIL import Image, ImageOps

GALLERY = 'gallery'
THUMBS = os.path.join(GALLERY, 'thumbs')


def read_json(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(data, ensure_ascii=False, separators=(',', ':')))


def open_image(path):
    im = ImageOps.exif_transpose(Image.open(path))
    has_alpha = im.mode in ('RGBA', 'LA', 'PA') or 'transparency' in im.info
    return im.convert('RGBA' if has_alpha else 'RGB')


def webp_bytes(im, quality):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, method=6)
    return buf.getvalue()


def main():
    works = read_json(os.path.join(GALLERY, 'works.json'), [])
    sizes = read_json(os.path.join(THUMBS, 'sizes.json'), {})
    os.makedirs(THUMBS, exist_ok=True)
    made = []

    for work in works:
        src = (work or {}).get('src') if isinstance(work, dict) else None
        if not src:
            continue
        path = os.path.join(GALLERY, src)
        base = os.path.join(THUMBS, os.path.basename(src))
        need_700 = not os.path.exists(base + '.700.webp') or src not in sizes
        need_1200 = not os.path.exists(base + '.1200.webp')
        if not (need_700 or need_1200):
            continue
        if not os.path.isfile(path):
            print('no file, skipped:', src)
            continue
        im = open_image(path)
        w, h = im.size

        if need_700:
            small = im.resize((700, max(1, round(h * 700 / w))), Image.LANCZOS) if w > 700 else im.copy()
            with open(base + '.700.webp', 'wb') as f:
                f.write(webp_bytes(small, 82))
            sizes[src] = list(small.size)
        if need_1200:
            big = im.copy()
            big.thumbnail((1200, 1200), Image.LANCZOS)          # never larger than the original
            with open(base + '.1200.webp', 'wb') as f:
                f.write(webp_bytes(big, 82))
        made.append(src)

    if made:
        write_json(os.path.join(THUMBS, 'sizes.json'), sizes)
    print(f'{len(made)} work(s) updated' + (': ' + ', '.join(made) if len(made) <= 8 else ''))


if __name__ == '__main__':
    main()
