from pathlib import Path
import re
import subprocess

ROOT = Path('.')
css_path = ROOT / 'styles/app.css'
index_path = ROOT / 'index.html'
settings_path = ROOT / 'js/settings.js'
sw_path = ROOT / 'service-worker.js'
readme_path = ROOT / 'README.md'
doc_path = ROOT / 'docs/v65.15-css-audit.md'

css = css_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
settings = settings_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8')
readme = readme_path.read_text(encoding='utf-8')

# Idempotent rerun: if source is already v65.15, only validate and exit.
already_done = 'const APP_VERSION = "v65.15";' in settings

if not already_done:
    # 1) Impossible media query. max-width:0px cannot match a rendered viewport.
    dead_start = '    @media (orientation: portrait) and (max-width: 0px) {\n'
    next_marker = '    /* v52.3: 看板編集は通常フォーム + Canvasプレビュー */\n'
    start = css.find(dead_start)
    end = css.find(next_marker)
    if start < 0 or end < 0 or end <= start:
        raise SystemExit('dead portrait media block markers not found')
    css = css[:start] + next_marker + css[end + len(next_marker):]

    # 2) Merge a split #boardEditHost declaration into the later active block.
    standalone = '''    #boardEditHost {\n      position: relative;\n    }\n\n'''
    if css.count(standalone) != 1:
        raise SystemExit('standalone #boardEditHost position block not found exactly once')
    css = css.replace(standalone, '', 1)

    active_host = '''    #boardEditHost {\n      display: flex;\n      flex-direction: column;'''
    merged_host = '''    #boardEditHost {\n      position: relative;\n      display: flex;\n      flex-direction: column;'''
    if active_host not in css:
        raise SystemExit('active v52.3 #boardEditHost block not found')
    css = css.replace(active_host, merged_host, 1)

    # 3) Version markers only. No layout values are changed beyond equivalent consolidation above.
    settings = settings.replace('const APP_VERSION = "v65.14";', 'const APP_VERSION = "v65.15";', 1)
    index = index.replace('id="settingsVersionText">v65.14<', 'id="settingsVersionText">v65.15<', 1)
    sw = sw.replace('const CACHE_NAME = "electronic-board-camera-v65.14";', 'const CACHE_NAME = "electronic-board-camera-v65.15";', 1)
    readme = readme.replace('# 電子看板カメラ v65.14', '# 電子看板カメラ v65.15', 1)
    if '## v65.15 CSS監査・整理' not in readme:
        readme += '''\n\n## v65.15 CSS監査・整理\n- 見た目を変えずにCSSの後勝ち・重複構造を監査\n- 成立しない `@media (orientation: portrait) and (max-width: 0px)` を削除\n- 分割されていた `#boardEditHost` の `position: relative` を現行ブロックへ統合\n- 看板編集のv52系以降の上書きは意図的な最終値が多いため、未確認の削除は行わない\n- UI、看板寸法、IndexedDB、保存形式、OneDrive仕様は変更なし\n'''

    css_path.write_text(css, encoding='utf-8')
    index_path.write_text(index, encoding='utf-8')
    settings_path.write_text(settings, encoding='utf-8')
    sw_path.write_text(sw, encoding='utf-8')
    readme_path.write_text(readme, encoding='utf-8')

# Build an audit report from the current source. This report is intentionally conservative:
# missing static HTML tokens are only candidates because classes may be added dynamically by JS.
html = index_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')
js_text = '\n'.join(p.read_text(encoding='utf-8') for p in (ROOT / 'js').glob('*.js'))

ids_html = set(re.findall(r'id="([^"]+)"', html))
classes_html = set()
for value in re.findall(r'class="([^"]+)"', html):
    classes_html.update(value.split())

simple_ids = sorted(set(re.findall(r'(?<![\\w-])#([A-Za-z_][\\w-]*)', css)))
simple_classes = sorted(set(re.findall(r'(?<![\\w-])\\.([A-Za-z_][\\w-]*)', css)))

id_candidates = [x for x in simple_ids if x not in ids_html and x not in js_text]
class_candidates = [x for x in simple_classes if x not in classes_html and x not in js_text]
important_count = css.count('!important')

report = f'''# v65.15 CSS監査\n\n## 方針\nCSSは後勝ちと `!important` を含むため、名前だけで削除しない。静的HTMLに無いクラスでもJavaScriptから付与される可能性があるため、未使用候補は削除せず記録だけする。\n\n## 今回削除・統合したもの\n- 成立しない `@media (orientation: portrait) and (max-width: 0px)` ブロックを削除。\n- `#boardEditHost {{ position: relative; }}` の単独定義を、後段の現行 `#boardEditHost` 定義へ統合。最終有効値は同じ。\n\n## 現在の注意点\n- `!important` 出現数: {important_count}\n- 看板編集周辺はv52.3 / v53.1 / v53.7などの後段上書きが現在の見た目を作っている。ここは実機比較なしで一括統合しない。\n- `.controls` の多数の `!important` も回転PWAレイアウト由来のため今回は維持。\n\n## 静的解析上の未使用候補（今回は削除しない）\n### ID\n{chr(10).join('- `' + x + '`' for x in id_candidates) if id_candidates else '- なし'}\n\n### class\n{chr(10).join('- `' + x + '`' for x in class_candidates) if class_candidates else '- なし'}\n\n## 次回候補\n未使用候補をHTML・JS・実機表示の3点で確認し、完全に死んでいるスタイルだけ削除する。\n'''
doc_path.write_text(report, encoding='utf-8')

# Validation
for js in sorted((ROOT / 'js').glob('*.js')):
    subprocess.run(['node', '--check', str(js)], check=True)

css = css_path.read_text(encoding='utf-8')
settings = settings_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')
sw = sw_path.read_text(encoding='utf-8')

if '@media (orientation: portrait) and (max-width: 0px)' in css:
    raise SystemExit('dead media query still exists')
if css.count('#boardEditHost {\n      position: relative;') != 1:
    raise SystemExit('expected one merged #boardEditHost position declaration')
if 'const APP_VERSION = "v65.15";' not in settings:
    raise SystemExit('APP_VERSION mismatch')
if 'id="settingsVersionText">v65.15<' not in index:
    raise SystemExit('HTML version mismatch')
if 'electronic-board-camera-v65.15' not in sw:
    raise SystemExit('SW version mismatch')

print('v65.15 css audit/cleanup validation passed')
