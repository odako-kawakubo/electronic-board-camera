# 電子看板カメラ v53.5

## 修正内容
- 編集フォームの入力値を `boardEditDraft` へ常時同期
- 日本語入力中は compositionstart / compositionend を監視
- 完了時はDOMを読み直さず、同期済み下書きを確定データへ反映
- iPhone Safariでは pointerup / touchend / click のいずれでも完了要求を受け付け
- 設定画面表示中も設定ボタンを前面に保ち、再タップで閉じる動作を復旧
- 設定画面の背景タップでも閉じる
- 縦持ち時の横向き表示と上下反転を維持
