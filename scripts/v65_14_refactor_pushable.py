from pathlib import Path

source_path = Path(__file__).with_name("v65_14_refactor.py")
source = source_path.read_text(encoding="utf-8")
marker = "# -----------------------------------------------------------------------------\n# 一時実行物を最終コミットに残さない。"
if marker not in source:
    raise SystemExit("cleanup marker not found")

# 変換・静的検証までは元スクリプトと同じものを実行する。
# Workflowファイルの自己書換えだけはGitHub Actions botの権限制約に触れるため実行しない。
exec(compile(source.split(marker, 1)[0], str(source_path), "exec"), {"__name__": "__main__", "__file__": str(source_path)})
