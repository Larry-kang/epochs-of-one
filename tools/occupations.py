#!/usr/bin/env python3
"""C0: careers-draft.csv (approved design table) -> src/content/occupations.json (structured; every number 推估 until L1 data)."""
import csv, json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = list(csv.DictReader(open(os.path.join(ROOT, 'tools/careers-draft.csv'), encoding='utf-8')))

def edu(s):
    s = s.lower()
    if 'phd' in s or 'graduate' in s or 'medical' in s: return 'graduate'
    if s.startswith('tertiary') or 'tertiary (typ' in s and 'none' not in s: return 'tertiary'
    if s.startswith('secondary') or 'vocational' in s: return 'secondary'
    if s.startswith('primary'): return 'primary'
    if 'tertiary typ.' in s: return 'tertiary'
    return 'none'

def ladder(s):
    out = []
    for part in s.split('>'):
        m = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*$', part.strip())
        name = re.sub(r'\s*[0-9.]+\s*$', '', part.strip())
        if m: out.append([name, float(m.group(1))])
    return out or [['-', 1.0]]

def drivers(s, r):
    t = s.lower(); d = {}
    m = re.search(r'post-(\d{4})', t) or re.search(r'(\d{4})\+', t) or re.search(r'gig era \((\d{4})', t)
    if m: d['from'] = int(m.group(1))
    m = re.search(r'pre-(\d{4})', t)
    if m: d['pre'] = int(m.group(1))
    if 'female-skewed' in t: d['sex'] = 'F'
    elif re.search(r'\bmale\b', t) or 'male-skewed' in t: d['sex'] = 'M'
    if 'rural' in t: d['rural'] = 1
    if 'urban' in t: d['urban'] = 1
    if 'coastal' in t: d['coastal'] = 1
    if 'low quintile' in t or 'low-income' in t or 'low income' in t: d['lowQ'] = 1
    if 'high quintile' in t: d['highQ'] = 1
    if 'smart' in t: d['smart'] = 1
    if 'social' in t: d['social'] = 1
    m = re.search(r'twn ×(\d)', t)
    if m: d['twn'] = int(m.group(1))
    if 'extremely rare' in t: d['rare'] = 3
    elif 'very rare' in t: d['rare'] = 2
    elif re.search(r'\brare\b', t): d['rare'] = 1
    if 'usa/rus/chn/eu/jpn only' in t: d['space'] = 1
    if 'young' in t or '16–25' in t or 'age < 30' in t: d['young'] = 1
    return d

def risk(s, g):
    t = s.lower(); r = {'unemp': 1.0, 'mort': 1.0}
    if 'unemployment very low' in t or g == 'public': r['unemp'] = 0.5
    if 'cyclical' in t or 'layoff' in t or 'seasonal' in t or 'offshoring' in t: r['unemp'] = 1.3
    if 'mortality high' in t or 'mortality ↑↑' in t: r['mort'] = 1.35
    elif 'mortality elevated' in t or 'traffic mortality' in t or 'fall mortality' in t or 'mortality ↑' in t or 'injury very high' in t: r['mort'] = 1.15
    if 'early retirement' in t: r['early'] = 1
    return r

def wage(s):
    m = re.search(r'([0-9]+(?:\.[0-9]+)?)', s)
    return float(m.group(1)) if m else 0.0

out = []
for r in rows:
    g = r['group']
    out.append({
        'id': r['id'], 'zh': r['name_zh'], 'en': r['name_en'], 'isco': r['isco08'], 'group': g,
        'rel': wage(r['rel_wage']), 'est': True, 'ladder': ladder(r['ladder']), 'edu': edu(r['edu_min']),
        'drv': drivers(r['entry_drivers'], r), 'risk': risk(r['risks'], g),
        'to': [x.strip().split(' ')[0].split('→')[-1] for x in r['transitions'].split(',') if x.strip()],
        'src': r['source_licence'],
    })
ids = {o['id'] for o in out}
for o in out: o['to'] = [x for x in o['to'] if x in ids and x != o['id']]
json.dump({'version': 'c0-draft-2026-10-16', 'note': '推估: design estimates from tools/careers-draft.csv; replaced by sourced values in L1.', 'occupations': out},
          open(os.path.join(ROOT, 'src/content/occupations.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(out), 'occupations')
