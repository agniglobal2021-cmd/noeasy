"""Move the files embedded in the-halls/index.html (data: URIs) into the-halls/assets/.

The page used to carry its textures, fonts and logo inline as base64: 1.1 MB the browser had to read
before anything else, and could not keep between visits. Each one now lives in its own file, named
<what>.<first 8 hex of its sha1>.<ext>, so a changed file always gets a new name and no cache can serve
an old copy. The bytes are exactly the ones that were inline: nothing is re-encoded.

Run from the repository root:  python3 tools/halls_assets.py
It only touches data: URIs still left in the page, so running it again is harmless.
"""
import base64, hashlib, os, re, sys

PAGE = 'the-halls/index.html'
OUT = 'the-halls/assets'
EXT = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'font/otf': 'otf', 'font/woff2': 'woff2'}
URI = re.compile(r'data:(image/jpeg|image/png|image/webp|font/otf|font/woff2);base64,([A-Za-z0-9+/=]+)')


def name_for(before):
    """a readable name from the text just before the data: URI"""
    tail = before[-160:]
    for pat, fmt in ((r"font-family:'([A-Za-z0-9]+)';src:url\($", '{}'), (r'<img id="(\w+)" src="$', '{}'),
                     (r'"(\w+)": ?"$', 'tex-{}'), (r'(\w+):"$', 'dec-{}'), (r'const (\w+)_SRC=\'$', '{}')):
        m = re.search(pat, tail)
        if m:
            return fmt.format(m.group(1)).lower()
    return 'file'


def main():
    page = open(PAGE, encoding='utf-8').read()
    os.makedirs(OUT, exist_ok=True)
    out, last, moved = [], 0, 0
    for m in URI.finditer(page):
        data = base64.b64decode(m.group(2))
        fn = '%s.%s.%s' % (name_for(page[:m.start()]), hashlib.sha1(data).hexdigest()[:8], EXT[m.group(1)])
        path = os.path.join(OUT, fn)
        if not os.path.exists(path):
            open(path, 'wb').write(data)
        out.append(page[last:m.start()]); out.append('assets/' + fn); last = m.end(); moved += 1
        print('%7d B  %s' % (len(data), fn))
    out.append(page[last:])
    open(PAGE, 'w', encoding='utf-8').write(''.join(out))
    print('moved', moved, 'files; page now', os.path.getsize(PAGE) // 1024, 'KB')


if __name__ == '__main__':
    sys.exit(main())
