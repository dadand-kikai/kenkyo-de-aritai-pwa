# 設計

## 全体像

```text
iPhone / Android / PC
  ├─ Cloudflare Pages: 静的PWA、オフラインキャッシュ
  ├─ IndexedDB: 回答、履歴、出題状態、端末設定
  ├─ OneSignal Web SDK: Push購読
  └─ Cloudflare Worker API
       ├─ D1: 通知識別子、希望時刻、タイムゾーンのみ
       └─ Cron (15分ごと) → OneSignal REST API
```

回答内容は端末外へ送信しません。通知タップ後にPWAが端末内履歴から当日の質問を決定します。

## アカウントなしの通知設定保護

初回設定時に端末でUUIDと256ビットのランダムな秘密値を生成します。D1には秘密値のSHA-256だけを保存します。更新・削除にはUUIDと秘密値の両方が必要です。APIは公開サイトのOriginだけを許可し、入力値、タイムゾーン、15分刻みを検証します。

これは端末を認証主体にする方式です。ブラウザデータを削除すると秘密値も失われるため、古い設定をその端末から更新できなくなります。OneSignal側の購読解除と、長期休眠レコードの定期削除を運用手順に含めます。

## 通知と重複防止

D1の `next_due` 索引から期限到来分だけを取得し、最大10,000購読ずつOneSignalへ送ります。同じ現地日には同じ `collapse_id` を指定します。送信成功後だけ翌日の `next_due` を更新し、失敗時は次のCronで再試行します。翌日時刻はIANAタイムゾーンから再計算するため夏時間に追従します。

## Service Worker

- `/sw.js`: アプリ本体のオフラインキャッシュ
- `/push/onesignal/OneSignalSDKWorker.js`: `/push/onesignal/` の狭いスコープでPushを担当

スコープを分離し、オフライン用とOneSignal用のService Worker競合を避けます。
