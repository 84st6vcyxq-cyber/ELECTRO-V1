#!/usr/bin/env python3
"""Génère theme/overlay/ (fichiers Dawn personnalisés pour Flairou).

Usage : python3 theme/make_overlay.py <chemin_vers_dawn_v16.2.0>
Les fichiers produits remplacent ceux de Dawn ; tout le reste du thème est inchangé.
Les images de thème sont référencées par nom de fichier Shopify (shopify://shop_images/...),
que scripts/deploy.mjs remplace par le nom réel après téléversement.
"""
import json, re, sys, os
from pathlib import Path

DAWN = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'theme' / 'overlay'
product = json.loads((ROOT / 'content' / 'product.json').read_text())
P = product['handle']

def load(p):
    t = (DAWN / p).read_text()
    return json.loads(re.sub(r'^/\*.*?\*/', '', t.strip(), flags=re.S))

def save(p, data):
    f = OUT / p
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

SAUGE, OCRE, CREME, ENCRE, BLANC = '#2F5D50', '#E0A13B', '#FBF6EC', '#1E2B27', '#FFFFFF'

def scheme(bg, text, button, label, secondary):
    return {'settings': {'background': bg, 'background_gradient': '', 'text': text, 'button': button,
                         'button_label': label, 'secondary_button_label': secondary, 'shadow': ENCRE}}

# ---------- config/settings_data.json ----------
sd = load('config/settings_data.json')
cur = dict(sd['presets']['Dawn'])
cur.pop('sections', None)
cur.update({
    'color_schemes': {
        'scheme-1': scheme(CREME, ENCRE, SAUGE, CREME, SAUGE),    # fond crème (par défaut)
        'scheme-2': scheme(BLANC, ENCRE, SAUGE, BLANC, SAUGE),    # fond blanc (cartes)
        'scheme-3': scheme(SAUGE, CREME, OCRE, ENCRE, CREME),     # fond sauge
        'scheme-4': scheme(OCRE, ENCRE, ENCRE, CREME, ENCRE),     # fond ocre
        'scheme-5': scheme(ENCRE, CREME, CREME, ENCRE, CREME),    # fond encre
    },
    'logo': 'shopify://shop_images/flairou-logo.png',
    'logo_width': 150,
    'favicon': 'shopify://shop_images/flairou-favicon.png',
    'type_header_font': 'poppins_n6',
    'type_body_font': 'nunito_sans_n4',
    'heading_scale': 110,
    'body_scale': 105,
    'buttons_radius': 40,
    'inputs_radius': 12,
    'variant_pills_radius': 40,
    'card_style': 'card',
    'card_corner_radius': 16,
    'card_color_scheme': 'scheme-2',
    'collection_card_corner_radius': 16,
    'text_boxes_radius': 16,
    'media_radius': 16,
    'popup_corner_radius': 16,
    'drawer_border_opacity': 10,
    'cart_type': 'drawer',
    'currency_code_enabled': False,
    'animations_reveal_on_scroll': True,
    'animations_hover_elements': 'default',  # 'none' (valeur Dawn par défaut) n'est pas dans les options du schéma
})
save('config/settings_data.json', {'current': cur, 'presets': sd['presets']})

# ---------- templates/index.json (accueil) ----------
def col(title, text):
    return {'type': 'column', 'settings': {'title': title, 'text': f'<p>{text}</p>', 'link_label': '', 'link': ''}}

def blocks(items):
    b = {f'b{i}': it for i, it in enumerate(items, 1)}
    return b, list(b.keys())

hero_b, hero_o = blocks([
    {'type': 'heading', 'settings': {'heading': 'Le flair, c’est leur super-pouvoir.', 'heading_size': 'h0'}},
    {'type': 'text', 'settings': {'text': 'Cachez ses croquettes dans le tapis de fouille Flairou : il les cherche au flair, une à une. Le repas dure plus longtemps, et votre chien a une vraie activité.', 'text_style': 'body'}},
    {'type': 'buttons', 'settings': {'button_label_1': 'Découvrir le tapis', 'button_link_1': f'shopify://products/{P}', 'button_style_secondary_1': False,
                                     'button_label_2': 'Questions fréquentes', 'button_link_2': 'shopify://pages/faq', 'button_style_secondary_2': True}},
])
ben_b, ben_o = blocks([
    col('Un repas qui dure', 'Chaque croquette se cherche au flair : impossible de tout avaler en quelques secondes comme à la gamelle.'),
    col('Une vraie activité', 'Un jeu de recherche à proposer à la maison, les jours de pluie ou après la promenade.'),
    col('Simple et lavable', 'Pliable, base antidérapante, lavable en machine à 30 °C dans un filet.'),
])
how_b, how_o = blocks([
    col('1. Cachez', 'Dispersez croquettes ou friandises dans les franges. Au début, laissez-les visibles.'),
    col('2. Posez', 'Placez le tapis à plat devant votre chien et restez à côté de lui.'),
    col('3. Laissez-le chercher', 'Il explore avec son nez. À la fin, secouez le tapis et rangez-le hors de sa portée.'),
])
fp_b, fp_o = blocks([
    {'type': 'title', 'settings': {'heading_size': 'h1'}},
    {'type': 'price', 'settings': {}},
    {'type': 'variant_picker', 'settings': {'picker_type': 'button', 'swatch_shape': 'circle'}},
    {'type': 'buy_buttons', 'settings': {'show_dynamic_checkout': True, 'show_gift_card_recipient': False}},
    {'type': 'text', 'settings': {'text': 'À utiliser sous surveillance. Lavable en machine à 30 °C.', 'text_style': 'subtitle'}},
])
faq_b, faq_o = blocks([
    {'type': 'collapsible_row', 'settings': {'heading': f['q'], 'icon': 'question_mark', 'row_content': f'<p>{f["a"]}</p>', 'page': ''}}
    for f in product['faq']
])
rea_b, rea_o = blocks([
    col('Livraison suivie', 'Expédition sous 1 à 3 jours ouvrés, livraison offerte dès 50 €.'),
    col('14 jours pour changer d’avis', 'Droit de rétractation de 14 jours après réception.'),
    col('Garantie légale de 2 ans', 'Produit non conforme ? Réparation, remplacement ou remboursement.'),
    col('Paiement sécurisé', 'Paiement traité par un prestataire de paiement sécurisé. Nous ne voyons jamais vos données bancaires complètes.'),
])

def multicol(title, b, o, scheme_id, cols, bg='none'):
    return {'type': 'multicolumn', 'blocks': b, 'block_order': o, 'settings': {
        'title': title, 'heading_size': 'h1', 'image_width': 'third', 'image_ratio': 'adapt',
        'button_label': '', 'button_link': '', 'columns_desktop': cols, 'column_alignment': 'center',
        'background_style': bg, 'color_scheme': scheme_id, 'columns_mobile': '1', 'swipe_on_mobile': False,
        'padding_top': 48, 'padding_bottom': 48}}

index = {
    'sections': {
        'hero': {'type': 'image-banner', 'blocks': hero_b, 'block_order': hero_o, 'settings': {
            'image': 'shopify://shop_images/flairou-hero.png', 'image_overlay_opacity': 30, 'image_height': 'large',
            'image_behavior': 'none', 'desktop_content_position': 'middle-left', 'desktop_content_alignment': 'left',
            'show_text_box': True, 'color_scheme': 'scheme-1', 'stack_images_on_mobile': True,
            'mobile_content_alignment': 'center', 'show_text_below': True}},
        'benefices': multicol('Pourquoi un tapis de fouille ?', ben_b, ben_o, 'scheme-1', 3),
        'comment_ca_marche': multicol('Comment ça marche', how_b, how_o, 'scheme-2', 3, bg='primary'),
        'produit': {'type': 'featured-product', 'blocks': fp_b, 'block_order': fp_o, 'settings': {
            'product': P, 'color_scheme': 'scheme-1', 'secondary_background': False, 'media_size': 'medium',
            'constrain_to_viewport': True, 'media_fit': 'contain', 'media_position': 'left', 'image_zoom': 'lightbox',
            'hide_variants': False, 'enable_video_looping': False, 'padding_top': 48, 'padding_bottom': 48}},
        'faq': {'type': 'collapsible-content', 'blocks': faq_b, 'block_order': faq_o, 'settings': {
            'caption': '', 'heading': 'Questions fréquentes', 'heading_size': 'h1', 'heading_alignment': 'center',
            'layout': 'none', 'container_color_scheme': 'scheme-2', 'color_scheme': 'scheme-1',
            'open_first_collapsible_row': True, 'image_ratio': 'adapt', 'desktop_layout': 'image_second',
            'padding_top': 48, 'padding_bottom': 48}},
        'reassurance': multicol('Achetez l’esprit tranquille', rea_b, rea_o, 'scheme-3', 4),
    },
    'order': ['hero', 'benefices', 'comment_ca_marche', 'produit', 'faq', 'reassurance'],
}
save('templates/index.json', index)

# ---------- templates/product.json ----------
pt = load('templates/product.json')
m = pt['sections']['main']
m['blocks'].pop('vendor', None)
m['block_order'] = [x for x in m['block_order'] if x != 'vendor']
m['blocks']['share']['settings']['share_label'] = 'Partager'
m['blocks']['buy_buttons']['settings']['show_gift_card_recipient'] = False
m['blocks']['tab_livraison'] = {'type': 'collapsible_tab', 'settings': {'heading': 'Livraison & retours', 'icon': 'truck', 'content': '', 'page': 'livraison-retours'}}
m['blocks']['tab_garanties'] = {'type': 'collapsible_tab', 'settings': {'heading': 'Garanties et rétractation', 'icon': 'return', 'content': '<p>14 jours pour changer d’avis après réception. Garantie légale de conformité de 2 ans et garantie des vices cachés. Détails dans nos <a href="/pages/cgv">CGV</a>.</p>', 'page': ''}}
i = m['block_order'].index('description') + 1
m['block_order'][i:i] = ['tab_livraison', 'tab_garanties']
if 'related-products' in pt['sections']:
    pt['sections']['related-products']['settings']['heading'] = 'Vous aimerez aussi'
save('templates/product.json', pt)

# ---------- templates/password.json (page « bientôt ouvert ») ----------
pw = load('templates/password.json')
pb = pw['sections']['main']['blocks']
pb['heading']['settings']['heading'] = 'Bientôt chez vous'
pb['paragraph']['settings']['text'] = '<p>Flairou ouvre très bientôt. Laissez votre e-mail pour être prévenu de l\u2019ouverture.</p>'
save('templates/password.json', pw)

# ---------- sections/header-group.json ----------
hg = load('sections/header-group.json')
ab = hg['sections']['announcement-bar']
ab['settings']['color_scheme'] = 'scheme-3'
ab['blocks'] = {'annonce': {'type': 'announcement', 'settings': {
    'text': 'Livraison offerte dès 50 € · 14 jours pour changer d’avis',
    'link': 'shopify://pages/livraison-retours'}}}
ab['block_order'] = ['annonce']
h = hg['sections']['header']['settings']
h.update({'menu': 'main-menu', 'enable_country_selector': False, 'enable_language_selector': False})
save('sections/header-group.json', hg)

# ---------- sections/footer-group.json ----------
fg = load('sections/footer-group.json')
f = fg['sections']['footer']
f['blocks'] = {
    'marque': {'type': 'text', 'settings': {'heading': 'Flairou', 'subtext': '<p>Le flair, c’est leur super-pouvoir. Des jeux de flair simples pour occuper votre chien à la maison.</p>'}},
    'infos': {'type': 'link_list', 'settings': {'heading': 'Informations', 'menu': 'footer'}},
}
f['block_order'] = ['marque', 'infos']
f['settings'].update({'color_scheme': 'scheme-3', 'newsletter_enable': True,
                      'newsletter_heading': 'Des idées de jeux de flair, une fois par mois',
                      'enable_follow_on_shop': False, 'enable_country_selector': False,
                      'enable_language_selector': False, 'payment_enable': True, 'show_policy': True})
save('sections/footer-group.json', fg)

print('overlay écrit dans', OUT)
for p in sorted(OUT.rglob('*.json')):
    print(' -', p.relative_to(OUT))
