#!/usr/bin/env python3
"""把 design/src 下的页面装配成可导入 Superdesign 的独立 HTML。

为什么要有这一步：canvas 的 import 只接受"一个完整文档"，外部 CSS 拿不到；但几个页面
必须共用同一套设计语言，所以源文件按 app.css + 页面 css + 页面标记拆开，这里再拼成
独立文件。深色主题只是把 :root 里的语义色换成另一组值（同一份标记，不复制页面）。

输出：design/dist/<page>[-<state>]-<theme>.html
"""
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / 'src'
DIST = ROOT / 'dist'

LIGHT = (SRC / 'tokens-light.txt').read_text(encoding='utf-8')
DARK = (SRC / 'tokens-dark.txt').read_text(encoding='utf-8')

# page -> (标题, 需要产出的状态列表；空表示单态页面)
PAGES = {
    'home': ('首页', ['idle', 'measured', 'search']),
    'sites': ('站点', ['']),
    'site': ('站点详情', ['']),
    'help': ('帮助', ['']),
    'eco': ('生态文档', ['']),
}

STATE_LABEL = {'idle': '测速中', 'measured': '已测速', 'search': '搜索态'}


def build(page, state, theme):
    css = (SRC / 'app.css').read_text(encoding='utf-8')
    css += '\n/* ── 页面专属 ─────────────────────────────────────────── */\n'
    css += (SRC / 'pages-css' / f'{page}.css').read_text(encoding='utf-8')
    body = (SRC / 'pages' / f'{page}.html').read_text(encoding='utf-8')
    if '{{STATE}}' in body:
        body = body.replace('{{STATE}}', state or 'idle')
    if theme == 'dark':
        css = css.replace(LIGHT, DARK)
    title = PAGES[page][0] + (f' · {STATE_LABEL[state]}' if state else '')
    title += '' if theme == 'light' else '（深色）'
    name = page + (f'-{state}' if state else '') + f'-{theme}'
    (DIST / f'{name}.html').write_text(
        f'''<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MirrorN · {title}</title>
    <style>
{css}
    </style>
  </head>
  <body>
{body}
  </body>
</html>
''',
        encoding='utf-8',
    )
    return name


for page, (title, states) in PAGES.items():
    for state in states:
        for theme in ('light', 'dark'):
            print(build(page, state, theme))

# 移动端刻度三种方案的对照（同一页，只换 data-axis）
src = (DIST / 'home-measured-light.html').read_text(encoding='utf-8')
for axis in ('off', 'three', 'four'):
    out = src.replace('<body>', f'<body data-axis="{axis}">')
    (DIST / f'home-axis-{axis}.html').write_text(out, encoding='utf-8')
    print(f'home-axis-{axis}')

