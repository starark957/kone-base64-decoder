"""팝업용 폰트를 만든다: Pretendard JP 가변 폰트에서 팝업에 쓰는 글자만 남긴다.

원본은 항상 Pretendard JP를 쓴다(한글·영문에 더해 한자·일본어 글자도 들어 있어서,
문구에 한자가 들어가도 같은 폰트에서 가져온다).

사용법 (fonttools, brotli 필요: pip install fonttools brotli)
    python scripts/subset-font.py <PretendardJPVariable.woff2 경로>

원본: https://github.com/orioncactus/pretendard v1.3.9의
packages/pretendard-jp/dist/web/variable/woff2/PretendardJPVariable.woff2
(라이선스: packages/pretendard-jp/dist/LICENSE.txt → src/popup/fonts/OFL.txt)

Pretendard JP는 SIL Open Font License 1.1이고 "Pretendard JP"가 예약 글꼴 이름이다.
글자를 줄인 것은 수정본이므로 글꼴 이름을 바꿔서 저장한다(OFL 3항).
팝업 문구를 바꾸면 이 스크립트를 다시 돌려야 새 글자가 들어간다.
"""
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [ROOT / 'src/popup/popup.html', ROOT / 'src/popup/popup.js']
OUT = ROOT / 'src/popup/fonts/popup-sans.woff2'
NEW_FAMILY = 'Popup Sans'  # 예약 이름(Pretendard JP) 대신 쓰는 이름
NEW_PS = 'PopupSans'

# 숫자·영문·기호(버전, Base64, 주소 등)와 자주 쓰는 문장 부호
BASE = ''.join(chr(c) for c in range(0x20, 0x7F)) + '·…–—“”‘’↺→←'


def collect_text():
    chars = set(BASE)
    for path in SOURCES:
        text = path.read_text(encoding='utf-8')
        text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
        chars.update(ch for ch in text if ord(ch) >= 0x20)
    return ''.join(sorted(chars))


def rename(font):
    for rec in font['name'].names:
        s = rec.toUnicode()
        if 'Pretendard' not in s:
            continue
        if rec.nameID == 6 or rec.nameID == 25:  # PostScript 이름류: 공백 없음
            s = s.replace('PretendardJP', NEW_PS).replace('Pretendard', NEW_PS)
        else:
            s = s.replace('Pretendard JP', NEW_FAMILY).replace('Pretendard', NEW_FAMILY)
        rec.string = s


def main(src):
    sys.stdout.reconfigure(encoding='utf-8')
    text = collect_text()
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    font = TTFont(src)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    rename(font)

    cmap = font.getBestCmap()
    missing = [ch for ch in text if ord(ch) not in cmap and not ch.isspace()]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(OUT)
    names = sorted({r.toUnicode() for r in font['name'].names if r.nameID in (1, 4, 6, 16)})
    print(f'{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1024:.1f} KB, 글자 {len(text)}개, 축 {[a.axisTag for a in font["fvar"].axes]}')
    print('이름:', names)
    if missing:
        print('폰트에 없는 글자:', ''.join(missing))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
