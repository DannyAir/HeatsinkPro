#!/usr/bin/env python3
"""Assemble the self-contained study page: src/ -> dist/HeatsinkStudy_<REV>.html"""
import pathlib

REV = 'r2'
root = pathlib.Path(__file__).resolve().parent
src = root / 'src'
t = (src / 'template.html').read_text(encoding='utf-8').replace('<h2>Airflow and fan pressure</h2>', '<h2>Airflow</h2>')
for placeholder, name in [('/*ENGINE*/', 'engine.js'), ('/*DEFAULTS*/', 'defaults.js'), ('/*UI*/', 'ui.js')]:
    t = t.replace(placeholder, (src / name).read_text(encoding='utf-8'))
out = root / 'dist' / f'HeatsinkStudy_{REV}.html'
out.parent.mkdir(exist_ok=True)
out.write_text(t, encoding='utf-8')
print('built', out.relative_to(root), len(t), 'chars')
