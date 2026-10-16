#!/usr/bin/env python3
"""Add/overwrite UI strings in src/content/i18n/table.json.  usage: i18n-add.py file.json  ({"key": [zh, en, ja, ko, vi]})"""
import json, sys
P = 'src/content/i18n/table.json'
def dump(o):  # same layout as the table: indent 0, one value per line
    return json.dumps(o, ensure_ascii=False, indent=0) + '\n'
d = json.load(open(P))
add = json.load(open(sys.argv[1]))
sect = add.pop('__section', 'ui')
for k, v in add.items():
    assert isinstance(v, list) and len(v) == 5, k
    d['strings'][sect][k] = v
open(P, 'w').write(dump(d))
print(f'{len(add)} keys → {sect}')
