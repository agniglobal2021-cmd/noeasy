"""Draft 3 of the Volchok shell: everything shown comes from volchok.ru (checked 27.10.2026).

Fills the marked blocks <!-- @name --> ... <!-- /@name --> in the pages and writes assets/items.js.
Item order is the order of the listing on volchok.ru (НОВОЕ). Icons the artist draws go to
assets/icons/<number>.webp|png|svg and replace the spiral placeholder automatically on the next build.
"""
import html, json, os, re, zlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '')
SITE = 'https://volchok.ru'

# Sections of the shop exactly as the site's menu names them, with their pages on volchok.ru
CATS = [
    # key, menu name, page, top group
    ('futbolki', 'Футболки', '/shop/futbolki/', 'odezhda'),
    ('longslivy', 'Лонгсливы', '/shop/longslivy/', 'odezhda'),
    ('mayki', 'Майки / топы', '/shop/mayki-topy/', 'odezhda'),
    ('bodi', 'Боди / водолазки', '/shop/bodi-vodolazki/', 'odezhda'),
    ('dzhempery', 'Джемперы', '/shop/dzhempery/', 'odezhda'),
    ('zhiletki', 'Жилетки', '/shop/zhiletki/', 'odezhda'),
    ('khudi', 'Худи', '/shop/khudi/', 'odezhda'),
    ('verkh', 'Верхняя одежда', '/shop/verkhnyaya-odezhda/', 'odezhda'),
    ('bryuki', 'Брюки / джинсы / шорты', '/shop/bryuki-sportivnye-shtany-shorty/', 'odezhda'),
    ('kepki', 'Кепки / шапки', '/shop/kepki-shapki-balaklavy/', 'aksessuary'),
    ('sharfy', 'Шарфы', '/shop/sharfy/', 'aksessuary'),
    ('sumki', 'Сумки / рюкзаки / шопперы', '/shop/sumki-ryukzaki-shopgery/', 'aksessuary'),
    ('ukrasheniya', 'Украшения', '/shop/ukrasheniya/', 'aksessuary'),
    ('noski', 'Носки', '/shop/noski/', 'aksessuary'),
    ('prochee', 'Прочее', '/shop/aksessuary/', 'aksessuary'),
]
TOP = [('odezhda', 'Одежда'), ('aksessuary', 'Аксессуары')]
CAT = {c[0]: c for c in CATS}

# kind, NAME (as on the site), price, old price, shop path, section — in the site's order
ITEMS = [
    ('Стринги', 'ПОТОМУ ЧТО', 1500, 0, '71458-stringi_potomu_chto_stringi_potomu_chto', 'prochee'),
    ('Бомбер', 'ОРНАМЕНТ', 16800, 0, '71300-bomber_ornament_bomber_ornament', 'verkh'),
    ('Флешка', 'МЕЧ ПАМЯТИ', 4200, 0, '71530-fleshka_mech_pamyati_fleshka_mech_pamyati', 'prochee'),
    ('Футболка', 'ЕФИМБ', 3900, 0, '71524-futbolka_efimb_futbolka_efimb', 'futbolki'),
    ('Футболка', 'САТАН БАНАНА', 3900, 0, '71518-futbolka_satan_banana_futbolka_satan_banana', 'futbolki'),
    ('Футболка', 'МЕЧ', 3900, 0, '71500-futbolka_mech_futbolka_mech', 'futbolki'),
    ('Футболка', 'КЛОУН', 3900, 0, '71506-futbolka_kloun_futbolka_kloun', 'futbolki'),
    ('Футболка', 'ШИЗА', 3900, 0, '71494-futbolka_shiza_futbolka_shiza', 'futbolki'),
    ('Футболка', 'ТАМАГОЧИ', 3900, 0, '71512-futbolka_tamagochi_futbolka_tamagochi', 'futbolki'),
    ('Бомбер', 'ЯПОНИЯ', 19800, 0, '71294-bomber_serafim_2_bomber_serafim_2', 'verkh'),
    ('Футболка', 'РЫЦАРЬ ВОЛК', 4900, 0, '71486-futbolka_ryczar_volk_futbolka_ryczar_volk', 'futbolki'),
    ('Худи', 'БИТВА', 9800, 0, '71466-khudi_bitva_khudi_bitva', 'khudi'),
    ('Подставка', 'ЗАМОК', 1900, 0, '71484-dekorativnaya_podstavka_pod_spiral_ot_komarov_i_letayushhih_nasekomyh_zamok_dekorativnaya_podstavka_pod_spiral_ot_komarov_i_letayushhih_nasekomyh_zamok', 'prochee'),
    ('Дождевик', 'ДЕМОН', 6666, 0, '71385-dozhdevik_demon_dozhdevik_demon', 'verkh'),
    ('Джемпер', 'ДЕМОН', 9200, 0, '71359-dzhemper_mechi_2_dzhemper_mechi_2', 'dzhempery'),
    ('Кроп-топ', 'АНГЕЛ', 3500, 0, '71429-krop-top_angel_i_demon_krop-top_angel_i_demon', 'mayki'),
    ('Лонгслив', 'АНГЕЛ И ДЕМОН', 6900, 0, '71435-longsliv_angel_i_demon_longsliv_angel_i_demon', 'longslivy'),
    ('Кепка', 'БАБОЧКА', 2600, 0, '71464-kepka_babochka_kepka_babochka', 'kepki'),
    ('Футболка', 'ЧУЧЕЛО', 4900, 0, '71415-futbolka_ryczar_futbolka_ryczar', 'futbolki'),
    ('Футболка', 'ЛЮБОВЬ И СМЕРТЬ', 4700, 0, '71440-futbolka_lyubov_i_smert_futbolka_lyubov_i_smert', 'futbolki'),
    ('Джерси', 'МОЛНИИ', 7900, 0, '71395-dzhersi_molnii_dzhersi_molnii', 'longslivy'),
    ('Фляга', 'ЭТО ТЕБЕ', 3600, 0, '71421-flyaga_eto_tebe_flyaga_eto_tebe', 'prochee'),
    ('Футболка', 'ЭТО ТЕБЕ', 4500, 0, '71423-futbolka_eto_tebe_futbolka_eto_tebe', 'futbolki'),
    ('Худи', 'ПРОЦВЕТАНИЕ', 9400, 0, '71452-khudi_proczvetanie_khudi_proczvetanie', 'khudi'),
    ('Кепка', 'ДЭТ МЕТАЛ', 2600, 0, '71353-kepka_det_metal_kepka_det_metal', 'kepki'),
    ('Футболка', 'ГАББАГЕДОН', 4800, 0, '71364-futbolka_gabbagedon_futbolka_gabbagedon', 'futbolki'),
    ('Носки', 'ЦЕПИ', 600, 0, '71355-noski_czepi_noski_czepi', 'noski'),
    ('Кепка', 'ВЕНОМ', 2600, 0, '71351-kepka_venom_kepka_venom', 'kepki'),
    ('Нашивка', 'ЭМО', 300, 0, '71349-nashivka_emo_nashivka_emo', 'prochee'),
    ('Шоппер', 'ВОЛЧОК Х ШУРАЛЕ', 4800, 0, '71332-shopper_shurale_shopper_shurale', 'sumki'),
    ('Стикерпак', 'ВОЛЧОК', 500, 0, '71190-stikerpak_volchok_stikerpak_volchok', 'prochee'),
    ('Таблетница', 'ЭМО', 700, 0, '71328-tabletnicza_emo_tabletnicza_emo', 'prochee'),
    ('Носки', 'ЗА ПРАВДОЙ', 600, 0, '71316-noski_za_pravdoj_noski_za_pravdoj', 'noski'),
    ('Шапка', 'ЭМО', 3200, 0, '71192-shapka_emo_shapka_emo', 'kepki'),
    ('Шапка', 'ЭМО', 2700, 0, '71273-shapka_emo_poloska_shapka_emo_poloska', 'kepki'),
    ('Футболка', 'РУССКАЯ ГОТИКА', 4400, 0, '71281-futbolka_russkaya_gotika_futbolka_russkaya_gotika', 'futbolki'),
    ('Боди', 'ДИГИТОНИКА', 6500, 0, '71268-bodi_digitonica_bodi_digitonica', 'bodi'),
    ('Боди', 'ДОСПЕХИ', 6500, 0, '16998-bodi_dospekhi_bodi_dospekhi', 'bodi'),
    ('Подвеска', 'КРЕСТ', 9500, 0, '71194-podveska_cross_podveska_cross', 'ukrasheniya'),
    ('Кольцо', 'СЕРДЦЕ', 8500, 0, '71248-kolczo_heart_kolczo_heart', 'ukrasheniya'),
    ('Футболка', 'РОМАНТИК', 4800, 0, '71236-futbolka_romantic_futbolka_romantic', 'futbolki'),
    ('Джемпер', 'ЭМО', 11900, 0, '71211-dzhemper_emo_dzhemper_emo', 'dzhempery'),
    ('Джемпер', 'ЭЙСИД', 12800, 0, '15615-dzhemper_acid_dzhemper_acid', 'dzhempery'),
    ('Лайнер', 'МЕЧИ', 8700, 10900, '71173-lajner_swords_lajner_swords', 'verkh'),
    ('Капюшон', 'МЕЧИ', 5200, 0, '71233-kapyushon_swords_kapyushon_swords', 'kepki'),
    ('Флисовый жилет', 'МЕЧИ', 4900, 0, '71206-flisovyj_zhilet_swords_flisovyj_zhilet_swords', 'zhiletki'),
    ('Шоппер', 'МЫШИНЫЙ ТРИУМФ', 3800, 0, '71220-shopper_myshinyj_triumf_shopper_myshinyj_triumf', 'sumki'),
    ('Варежки', 'МЕЧИ', 2000, 0, '71184-varezhki_swords_varezhki_swords', 'prochee'),
    ('Обложка', 'ВЕНОМ', 600, 0, '71187-oblozhka_venom_oblozhka_venom', 'prochee'),
    ('Брелок', 'ВОЛЧОК', 500, 0, '4421-brelok_unity', 'prochee'),
    ('Шоппер', 'МЕЧИ', 1600, 0, '71160-shopper_swords_shopper_swords', 'sumki'),
    ('Шарф', 'ДРАКОН', 3900, 0, '71127-sharf_dragon_eyes_sharf_dragon_eyes', 'sharfy'),
    ('Флиска', 'МЕЧИ', 9800, 0, '71070-fliska_swords_fliska_swords', 'verkh'),
    ('Худи', 'ИЗЛУЧЕНИЕ ЛЮБВИ', 8600, 0, '71042-khudi_izluchenie_lyubvi_khudi_izluchenie_lyubvi', 'khudi'),
    ('Джемпер', 'РАНИМ', 9200, 11500, '71048-dzhemper_ranim_dzhemper_ranim', 'dzhempery'),
    ('Серьга', 'СИЯНИЕ', 3200, 0, '17094-serga_siyanie_serga_siyanie', 'ukrasheniya'),
    ('Кольцо', 'ЛУННАЯ СЛЕЗА', 9500, 0, '71001-kolczo_moon_tear_kolczo_moon_tear', 'ukrasheniya'),
    ('Майка', 'ВЕРТЕБРА', 3200, 0, '70960-majka_vertebra_majka_vertebra', 'mayki'),
    ('Майка', 'ПЛАМЯ', 3400, 0, '19326-majka_flame_skull_majka_flame_skull-chernyj', 'mayki'),
    ('Джинсы', 'ЛЕТУЧАЯ МЫШЬ', 10600, 0, '70821-dzhinsy_batwings_dzhinsy_batwings', 'bryuki'),
    ('Шорты', 'ЛЕТУЧАЯ МЫШЬ', 7400, 0, '70822-shorty_dzhinsovye_batwings_shorty_dzhinsovye_batwings', 'bryuki'),
    ('Шорты пляжные', 'ЛОГО', 5600, 0, '70839-plyazhnye_shorty_volchok_2_plyazhnye_shorty_volchok_2', 'bryuki'),
    ('Сумка', 'ИССЛЕДОВАТЕЛЬ', 9800, 0, '70787-sumka_dungeon_explorer_sumka_dungeon_explorer', 'sumki'),
    ('Рюкзак', 'ИССЛЕДОВАТЕЛЬ', 11000, 0, '70789-ryukzak_dungeon_explorer_ryukzak_dungeon_explorer', 'sumki'),
    ('Худи', 'ПИКНИК', 10400, 0, '70691-khudi_picnic_khudi_picnic', 'khudi'),
    ('Худи', 'КАПЛЯ', 6800, 8500, '70703-khudi_kaplya_khudi_kaplya', 'khudi'),
    ('Шоппер', 'ЛЕТУЧАЯ МЫШЬ', 4800, 0, '70670-shopper_batwings_shopper_batwings', 'sumki'),
    ('Сумка', 'СУЩЕСТВО', 7900, 0, '70664-sumka_sushhestvo_sumka_sushhestvo', 'sumki'),
    ('Брюки', 'ЛЕТУЧАЯ МЫШЬ', 7500, 0, '70575-bryuki_batwings_bryuki_batwings', 'bryuki'),
    ('Джемпер', 'МЕЧИ', 7100, 8900, '70547-dzhemper_swords_dzhemper_swords', 'dzhempery'),
    ('Балаклава', 'ЭЙСИД', 3000, 0, '70536-balaklava_acid_balaklava_acid', 'kepki'),
    ('Водолазка', 'ЭЙСИД', 5200, 6500, '70480-bodi_armor_2_bodi_armor_2', 'bodi'),
    ('Леггинсы', 'ЭЙСИД', 5700, 0, '70494-legginsy_tribal_suit_legginsy_tribal_suit', 'bryuki'),
    ('Карабин-открывалка', 'ПОРТАЛ', 1800, 0, '70543-karabin-otkryvalka_portal_karabin-otkryvalka_portal', 'prochee'),
    ('Шапка', 'ЦЕПИ', 6600, 0, '70668-shapka_chain_-_bordovyj_shapka_chain_-_bordovyj', 'kepki'),
    ('Серьга', 'КЛЕШНИ', 2500, 0, '70286-serga_claws_serga_claws', 'ukrasheniya'),
]
assert len(ITEMS) == 76, len(ITEMS)

# The site's collections menu (/collection/), in the site's order, names as written there
COLLECTIONS = [
    ('LOGIC GAMES', 'logic-games'), ('PURGATORY', 'purgatory'), ('INTERNAL STRUGGLE', 'internal-struggle'),
    ('ARALEZ', 'aralez'), ('NO HOPE', 'no-hope'), ('ВОЛЧОК х SENSOR', 'volchok-kh-sensor'),
    ('ВОЛЧОК х SIGNAL', 'volchok-kh-signal'), ('Волчок х Сила ветра', 'volchok-kh-sila-vetra'),
    ('ЭПОХА ВОЗРОЖДЕНИЯ', 'epokha-vozrozhdeniya'), ('ПО ТУ СТОРОНУ СТЕНЫ', 'po-tu-storonu-steny'),
    ('Дроп 7', 'volchok-x-bharata-danu'), ('ТИРАН', 'tiran'), ('СЕКТА', 'sekta'),
    ('ХИЩНЫЕ ВЕЩИ ВЕКА', 'khishchnye-veshchi-veka'), ('ЕДИНСТВО', 'edinstvo'), ('Crash test', 'crash-test'),
    ('РЕПЛИКА', 'replika'), ('POSTHUMAN', 'posthuman'), ('ФИНАЛЬНАЯ ФАНТАЗИЯ', 'finalnaya-fantaziya'),
    ('СМЕРТЕЛЬНАЯ БИТВА', 'smertelnaya-bitva'), ('Лес', 'les'), ('НЕТ ЦАРЕЙ НЕТ БОГОВ', 'net-tsarey-net-bogov'),
]
CAPSULES = [
    ('БАЗОВАЯ ЛИНЕЙКА', '/shop/baza/'), ('VOLCHOK X FABULA', '/shop/volchok-x-fabula/'),
    ('КОНКУРС ПРИНТОВ', '/shop/konkurs-printov/'), ('VOLCHOK X DAVE LEVI', '/shop/volchok-x-dave-levi/'),
    ('VOLCHOK X ВОЛКИ ЛЮБИТЕ', '/shop/volki-lyubite/'), ('VOLCHOK X SASHA SULIM', '/shop/volchok-x-sasha-sulim/'),
    ('VOLCHOK X КИТАНА', '/shop/volchok-x-kitana/'),
]
assert len(COLLECTIONS) == 22

FEED = 12            # the first twelve of НОВОЕ open the home page
STRIPS = 5           # verticals in each card
DEFAULT_ITEM = '71466'


def num(i):
    return ITEMS[i][4].split('-')[0]


def rub(n):
    return f'{n:,}'.replace(',', ' ') + ' ₽'


def esc(s):
    return html.escape(s, quote=True)


def shop_url(i):
    return f'{SITE}/shop/{ITEMS[i][4]}/'


def price_html(i):
    _, _, p, old, *_ = ITEMS[i]
    return (f'<s>{rub(old)}</s> ' if old else '') + rub(p)


def turn(i):
    """A fixed angle per item, so the placeholder spiral is never the same twice in a row."""
    return zlib.crc32(num(i).encode()) % 360


def icon_file(n):
    for ext in ('webp', 'png', 'svg'):
        if os.path.exists(f'{ROOT}assets/icons/{n}.{ext}'):
            return f'assets/icons/{n}.{ext}'
    return None


def face(no_label, art):
    return ('<span class="face">'
            '<svg class="face__frame" viewBox="0 0 400 500" focusable="false"><use href="assets/frame.svg#frame"/></svg>'
            f'<span class="face__art">{art}</span>'
            f'<svg class="face__no" viewBox="0 0 400 24" focusable="false"><text x="200" y="16.2" text-anchor="middle">{no_label}</text></svg>'
            '</span>')


def card(i=None, label=None, extra='', strips=STRIPS):
    """The item card: one face, cut into vertical strips (each strip shows its slice of the same face).
    strips=1 gives the whole card in one piece (catalog, «more» tiles)."""
    if i is not None:
        n = num(i)
        f = icon_file(n)
        art = (f'<img src="{f}" alt="" decoding="async">' if f else
               f'<svg class="spiral" viewBox="7 6 934 603" focusable="false" style="--turn:{turn(i)}deg"><use href="assets/brand.svg#spiral"/></svg>')
        label = label or f'№&nbsp;{n}'
    else:
        art = '<svg class="spiral" viewBox="7 6 934 603" focusable="false" style="--turn:0deg"><use href="assets/brand.svg#spiral"/></svg>'
    fc = face(label, art)
    if strips == 1:
        return f'<span class="card card--whole"{extra} aria-hidden="true"><span class="strip">{fc}</span></span>'
    parts = ''.join(f'<span class="strip" style="--j:{j}">{fc}</span>' for j in range(strips))
    return f'<span class="card"{extra} aria-hidden="true">{parts}</span>'


def fill(text, name, body):
    pat = re.compile(r'(<!-- @%s -->\n).*?(<!-- /@%s -->)' % (name, name), re.S)
    assert pat.search(text), name
    return pat.sub(lambda m: m.group(1) + body + m.group(2), text)


def feed_html():
    out = []
    for k in range(FEED):
        kind, name, p, old, path, c = ITEMS[k]
        n = num(k)
        href = f'item.html?id={n}'
        out.append(
            f'      <li class="slide" id="v{n}">\n'
            f'        <h3 class="s-name"><span class="roll"><span class="s-kind">{esc(kind)}</span> {esc(name)}</span></h3>\n'
            f'        <a class="s-card" href="{href}" tabindex="-1" aria-hidden="true">{card(k)}</a>\n'
            f'        <div class="s-side">\n'
            f'          <p class="s-price price"><span class="roll">{price_html(k)}</span></p>\n'
            f'          <p class="s-more"><span class="roll"><a class="more" href="{href}">Смотреть<span class="sr-only"> {esc(kind.lower())} {esc(name)}</span>'
            f'<svg class="more__arrow" viewBox="0 0 20 12" aria-hidden="true" focusable="false"><path d="M0 6h18M13 1l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></a></span></p>\n'
            f'        </div>\n'
            f'      </li>\n')
    # the last card opens the whole shop
    n_od = sum(1 for it in ITEMS if CAT[it[5]][3] == 'odezhda')
    n_ak = len(ITEMS) - n_od
    n_sale = sum(1 for it in ITEMS if it[3])
    out.append(
        '      <li class="slide slide--end" id="vse">\n'
        '        <h3 class="s-name"><span class="roll"><span class="s-kind">Одежда и&nbsp;аксессуары</span> Каталог</span></h3>\n'
        f'        <a class="s-card" href="catalog.html" tabindex="-1" aria-hidden="true">{card(None, "Каталог")}</a>\n'
        '        <div class="s-side">\n'
        '          <div class="s-price"><ul class="roll s-links">\n'
        f'            <li><a href="catalog.html#odezhda">Одежда<span class="muted"> {n_od}</span></a></li>\n'
        f'            <li><a href="catalog.html#aksessuary">Аксессуары<span class="muted"> {n_ak}</span></a></li>\n'
        f'            <li><a href="catalog.html?f=sale">SALE<span class="muted"> {n_sale}</span></a></li>\n'
        '          </ul></div>\n'
        '          <p class="s-more"><span class="roll"><a class="button" href="catalog.html">Открыть каталог</a></span></p>\n'
        '        </div>\n'
        '      </li>\n')
    return ''.join(out)


def collections_html():
    rows = []
    for k, (name, slug) in enumerate(COLLECTIONS):
        rows.append(f'    <li style="--i:{k}"><a href="{SITE}/collection/{slug}/">{esc(name)}</a></li>')
    return '\n'.join(rows) + '\n'


def capsules_html():
    rows = []
    for k, (name, path) in enumerate(CAPSULES):
        rows.append(f'    <li style="--i:{k}"><a href="{SITE}{path}">{esc(name)}</a></li>')
    return '\n'.join(rows) + '\n'


def build_items_js():
    rows = []
    for i, (kind, name, p, old, path, c) in enumerate(ITEMS):
        rows.append([num(i), kind, name, p, old, path, c, turn(i), icon_file(num(i)) or ''])
    cats = {c[0]: [c[1], SITE + c[2], c[3]] for c in CATS}
    js = ('/* Вещи с volchok.ru в порядке сайта (раздел НОВОЕ), октябрь 2026:\n'
          '   номер, тип, название, цена, старая цена, путь на сайте, раздел, поворот заглушки, иконка. */\n')
    js += 'window.VOLCHOK_ITEMS = ' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n'
    js += 'window.VOLCHOK_CATS = ' + json.dumps(cats, ensure_ascii=False, separators=(',', ':')) + ';\n'
    open(ROOT + 'assets/items.js', 'w').write(js)


def build_index():
    p = ROOT + 'index.html'
    t = open(p).read()
    t = fill(t, 'feed', feed_html())
    t = fill(t, 'collections', collections_html())
    t = fill(t, 'capsules', capsules_html())
    open(p, 'w').write(t)


def tile_html(i, k):
    """One thing in the inventory: its card, its full name as on the site, its price."""
    kind, name, p, old, path, c = ITEMS[i]
    n = num(i)
    sale = ' data-sale' if old else ''
    return (f'      <li style="--i:{k}"{sale}><a class="tile" href="item.html?id={n}">'
            f'{card(i, strips=1)}'
            f'<span class="tile__name"><span class="tile__kind">{esc(kind)}</span> {esc(name)}</span>'
            f'<span class="tile__price price">{price_html(i)}</span></a></li>')


def build_catalog():
    p = ROOT + 'catalog.html'
    t = open(p).read()
    n_sale = sum(1 for it in ITEMS if it[3])
    counts = {g: sum(1 for it in ITEMS if CAT[it[5]][3] == g) for g, _ in TOP}
    fl = [f'  <button class="filter" type="button" data-f="all" aria-pressed="true">Все<span class="count">{len(ITEMS)}</span></button>']
    for g, label in TOP:
        fl.append(f'  <button class="filter" type="button" data-f="{g}" aria-pressed="false">{label}<span class="count">{counts[g]}</span></button>')
    fl.append(f'  <button class="filter" type="button" data-f="sale" aria-pressed="false">SALE<span class="count">{n_sale}</span></button>')
    t = fill(t, 'filters', '\n'.join(fl) + '\n')
    blocks = []
    for g, label in TOP:
        groups = []
        for key, cname, page, top in CATS:
            if top != g:
                continue
            idx = [i for i, it in enumerate(ITEMS) if it[5] == key]
            if not idx:
                continue
            rows = '\n'.join(tile_html(i, k) for k, i in enumerate(idx))
            groups.append(f'  <section class="group" data-group="{key}" aria-labelledby="g-{key}">\n'
                          f'    <h3 id="g-{key}">{cname}<a class="group__site" href="{SITE}{page}">на&nbsp;volchok.ru</a></h3>\n'
                          f'    <ul class="tiles">\n{rows}\n    </ul>\n  </section>')
        blocks.append(f'<section class="top-group" id="{g}" data-top="{g}" aria-labelledby="t-{g}">\n'
                      f'  <h2 class="top-group__title" id="t-{g}">{label}</h2>\n' + '\n'.join(groups) + '\n</section>')
    t = fill(t, 'groups', '\n\n'.join(blocks) + '\n')
    open(p, 'w').write(t)


def build_item():
    p = ROOT + 'item.html'
    t = open(p).read()
    i = next(k for k in range(len(ITEMS)) if num(k) == DEFAULT_ITEM)
    kind, name, pr, old, path, c = ITEMS[i]
    t = fill(t, 'itemcard', f'    {card(i)}\n')
    head = (f'    <h1 class="item__name"><span class="item__kind" data-f="kind">{esc(kind)}</span> <span data-f="name">{esc(name)}</span></h1>\n'
            f'    <p class="item__price price" data-f="price">{price_html(i)}</p>\n'
            f'    <p class="item__note">Номер <span class="price" data-f="no">{num(i)}</span> в&nbsp;разделе '
            f'<a class="link" data-f="cat" href="{SITE}{CAT[c][2]}">{CAT[c][1]}</a>. Размеры и&nbsp;наличие — на&nbsp;странице вещи на&nbsp;volchok.ru.</p>\n'
            f'    <a class="button item__buy" data-f="buy" href="{shop_url(i)}">Купить на&nbsp;volchok.ru</a>\n'
            f'    <p class="item__help"><a class="link" href="{SITE}/client/">Помощь покупателю</a></p>\n')
    t = fill(t, 'itemhead', head)
    # more of the same name, or else from the same section
    same = [k for k in range(len(ITEMS)) if ITEMS[k][1] == name and k != i]
    title = f'Ещё {esc(name)}' if same else f'Ещё в&nbsp;разделе «{CAT[c][1]}»'
    if not same:
        same = [k for k in range(len(ITEMS)) if ITEMS[k][5] == c and k != i][:6]
    rows = '\n'.join(tile_html(k, j) for j, k in enumerate(same))
    t = fill(t, 'more', f'  <h2 class="h2" id="more-title" data-f="more-title">{title}</h2>\n  <ul class="tiles tiles--more" data-f="more">\n{rows}\n  </ul>\n')
    open(p, 'w').write(t)


def build_system():
    p = ROOT + 'system.html'
    t = open(p).read()
    rows = []
    for k in range(FEED):
        kind, name, *_ = ITEMS[k]
        rows.append(f'      <li><span class="price">{num(k)}</span> {esc(kind)} {esc(name)}</li>')
    t = fill(t, 'iconlist', '\n'.join(rows) + '\n')
    t = fill(t, 'syscard', f'      {card(11)}\n')
    open(p, 'w').write(t)


if __name__ == '__main__':
    build_items_js()
    build_index()
    build_catalog()
    build_item()
    build_system()
    print('items', len(ITEMS), 'feed', FEED, 'collections', len(COLLECTIONS), 'sale', sum(1 for it in ITEMS if it[3]))
