# 19 서류: 시연용 서류 세 장(D27)을 그린다. 지어낸 실제 회사의 서류처럼 보이지 않게 "시연" 표시를 넣는다.
# 대리점 이름·주소는 원본(m_agency_cv.csv)의 값이다. 다시 그리려면(Pillow 필요): python3 make.py
# 판독의 고정 응답(N.json)은 이 그림을 업스테이지 OCR에 한 번 보낸 응답이다(자동 검사는 업스테이지를 부르지 않는다).
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
here = Path(__file__).parent
W, H = 900, 1100

# 장마다: 임차인, 소재지, 호실(없으면 None), 기간
DOCS = {
    1: ('성일상사24', '성남시 상공로 128', '제3층 제302호', '2026.01.01 ~ 2027.12.31'),   # 호실이 다른 임대차계약서
    2: ('성일상사24', '성남시 상공로 128', '제1층 제101호', '2026.01.01 ~ 2027.12.31'),   # 호실까지 같은 임대차계약서
    3: ('한라인상사34', '고양시 중앙로 128', None, '2026.02.01 ~ 2028.01.31'),            # 호실이 빠진 서류
}

def font(size, bold=False):
    return ImageFont.truetype(FONT, size, index=6 if bold else 0)

for n, (tenant, addr, room, term) in DOCS.items():
    im = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(im)
    # 시연 표시: 오른쪽 위의 도장과 바닥의 글
    d.rectangle((W - 190, 40, W - 50, 110), outline=(200, 30, 30), width=4)
    d.text((W - 160, 50), '시연', font=font(40, True), fill=(200, 30, 30))
    d.text((60, H - 80), '시연용으로 만든 서류. 실제 계약서가 아니다.', font=font(22), fill=(120, 120, 120))
    d.text((60, 140), '부동산 임대차계약서', font=font(44, True), fill='black')
    d.line((60, 210, W - 60, 210), fill='black', width=2)
    rows = [('임대인', '시연 건물주'), ('임차인', tenant), ('소재지', addr)]
    rows += [('호실', room)] if room else [('목적물', '건물 일부')]
    rows += [('기간', term)]
    y = 260
    for k, v in rows:
        d.text((60, y), k, font=font(30, True), fill='black')
        d.text((240, y), v, font=font(30), fill='black')
        y += 80
    d.line((60, y, W - 60, y), fill='black', width=1)
    d.text((60, y + 30), '임대인과 임차인은 위 부동산에 관하여 임대차계약을 맺는다.', font=font(24), fill='black')
    im.save(here / f'{n}.png', optimize=True)
