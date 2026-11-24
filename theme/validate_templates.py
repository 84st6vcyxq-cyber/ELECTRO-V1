#!/usr/bin/env python3
"""Valide les fichiers de l'overlay contre les schémas Dawn (theme/build).

Contrôles : type de section existant, clés de réglage connues, types de blocs autorisés,
valeurs des listes déroulantes, bornes des curseurs, schémas de couleurs existants,
et ids de réglages globaux (settings_data.json).
Usage : python3 theme/validate_templates.py [theme/build]
"""
import json, re, sys
from pathlib import Path

B = Path(sys.argv[1] if len(sys.argv) > 1 else 'theme/build')
OV = Path(__file__).resolve().parent / 'overlay'
errors = []

def schema(section_type):
    f = B / 'sections' / f'{section_type}.liquid'
    if not f.exists():
        return None
    m = re.search(r'{% schema %}(.*?){% endschema %}', f.read_text(), re.S)
    return json.loads(m.group(1))

global_schema = json.loads((B / 'config' / 'settings_schema.json').read_text())
global_ids = {s['id']: s for g in global_schema for s in g.get('settings', []) if 'id' in s}
sd = json.loads((OV / 'config' / 'settings_data.json').read_text())['current']
schemes = set(sd['color_schemes'])

def check_settings(where, values, defs):
    defs = {d['id']: d for d in defs if 'id' in d}
    for k, v in values.items():
        d = defs.get(k)
        if d is None:
            errors.append(f'{where}: réglage inconnu « {k} »')
            continue
        t = d['type']
        if t in ('select', 'radio') and v not in [o['value'] for o in d['options']]:
            errors.append(f'{where}.{k}: valeur « {v} » hors options {[o["value"] for o in d["options"]]}')
        if t == 'range' and not (d['min'] <= v <= d['max']):
            errors.append(f'{where}.{k}: {v} hors bornes [{d["min"]}, {d["max"]}]')
        if t == 'color_scheme' and v not in schemes:
            errors.append(f'{where}.{k}: schéma de couleurs « {v} » inexistant')
        if t == 'checkbox' and not isinstance(v, bool):
            errors.append(f'{where}.{k}: booléen attendu')

for f in sorted(OV.rglob('*.json')):
    rel = f.relative_to(OV)
    data = json.loads(f.read_text())
    if rel.as_posix() == 'config/settings_data.json':
        for k in data['current']:
            if k not in global_ids and k not in ('color_schemes', 'sections', 'blocks'):
                errors.append(f'{rel}: réglage global inconnu « {k} »')
        check_settings(str(rel), {k: v for k, v in data['current'].items() if k in global_ids}, list(global_ids.values()))
        continue
    for sid, sec in data['sections'].items():
        sch = schema(sec['type'])
        where = f'{rel}#{sid}'
        if sch is None:
            errors.append(f'{where}: type de section « {sec["type"]} » inexistant')
            continue
        check_settings(where, sec.get('settings', {}), sch.get('settings', []))
        btypes = {b['type']: b for b in sch.get('blocks', [])}
        for bid, blk in sec.get('blocks', {}).items():
            if blk['type'] not in btypes:
                errors.append(f'{where}/{bid}: type de bloc « {blk["type"]} » non autorisé')
                continue
            check_settings(f'{where}/{bid}', blk.get('settings', {}), btypes[blk['type']].get('settings', []))
        if 'block_order' in sec and set(sec['block_order']) != set(sec.get('blocks', {})):
            errors.append(f'{where}: block_order incohérent avec blocks')
        if 'max_blocks' in sch and len(sec.get('blocks', {})) > sch['max_blocks']:
            errors.append(f'{where}: {len(sec["blocks"])} blocs > max_blocks {sch["max_blocks"]}')
    if set(data.get('order', [])) != set(data['sections']):
        errors.append(f'{rel}: « order » incohérent avec « sections »')

if errors:
    print('ÉCHEC :'); [print(' -', e) for e in errors]; sys.exit(1)
print(f'OK : {len(list(OV.rglob("*.json")))} fichiers de l\'overlay conformes aux schémas Dawn')
