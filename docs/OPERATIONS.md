# 運用・保守

## 毎月

- Cloudflare Workersのリクエスト、CPU、D1読取・書込を確認
- OneSignalの購読者数、配信成功、失敗率を確認
- 失効した購読や繰り返し失敗する購読を削除
- 主要iOS/Android更新後に通知とホーム画面起動を再確認

## 障害時

OneSignal送信が失敗すると `next_due` を更新しないため、次の15分Cronで再試行します。`collapse_id` に現地日を含め、再試行時の重複表示を抑えます。連続失敗時はCronを停止せず、OneSignalとCloudflareの状態ページ、Worker Logsを確認します。

## 鍵の管理

REST API KeyはCloudflare Secretにだけ保存します。漏えいの疑いがあればOneSignalで再発行し、`wrangler secret put` で差し替えます。Git履歴に秘密値がないことをリリース前に確認します。

## データ削除

利用者は設定画面の「通知購読を解除」でD1レコードを即時削除できます。ブラウザデータ消去で端末資格情報を失った休眠レコードは、最終更新から18か月を目安に管理者の保守処理で削除します。回答データはサーバーに存在しません。

## リリース

自動テスト、Android Chrome、iPhoneホーム画面PWAの順に確認し、Gitタグを付けます。PWAキャッシュ名を変更する場合は `sw.js` の `CACHE` も更新します。
