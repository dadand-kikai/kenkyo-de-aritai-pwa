# 無料枠と規模試算

確認日: 2026-11-20。料金・制限は変更されるため、公開前と利用増加時に公式ページを再確認してください。

| 利用者 | 月間通知 | 想定D1読取/日 | 想定D1書込/日 | 判定 |
|---:|---:|---:|---:|---|
| 100 | 3,000 | 約100 | 約100 | 無料枠内 |
| 500 | 15,000 | 約500 | 約500 | 無料枠内 |
| 1,000 | 30,000 | 約1,000 | 約1,000 | 無料枠内 |
| 3,000 | 90,000 | 約3,000 | 約3,000 | 無料枠内見込み |
| 5,000 | 150,000 | 約5,000 | 約5,000 | Cloudflareは無料枠内見込み。OneSignalの1送信10,000購読上限内 |

D1 Freeは1日5,000,000行読取、100,000行書込、合計5GB。Worker Freeは1日100,000リクエスト、Cronを含むCPU時間は1回10ms、Cron Triggerは5個までです。この構成はCron 1個、期限到来行だけを索引検索します。設定変更を含めても1,000人規模では十分な余裕があります。

OneSignal FreeのWeb Pushは1送信あたり最大10,000購読です。本構成は配信対象IDを最大10,000件に分割します。料金ページ上、Web Pushは新しい1,000 mobile MAU制限の対象外です。Growthは月額19米ドルから、加えて購読者単価が示されています。

## ボトルネックと有料化条件

- 1回の15分枠に10,000人超が集中するとOneSignal APIを複数回呼びます。
- Worker FreeのCPU 10msは大量対象のタイムゾーン再計算で最初の実測対象です。1,000人で負荷計測し、超過が見えた場合だけWorkers Paidを提案します。
- D1の書込は通知成功後に翌日時刻を更新します。5,000人/日でも無料上限の約5%ですが、索引更新分を含む管理画面の実測値を監視します。
- OneSignalの料金・無料機能が変更された場合は代替として標準Web Push + VAPIDを検討できますが、ブラウザごとの配信先管理と失効処理の保守負担が増えます。

公式資料:

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/pages/platform/limits/
- https://onesignal.com/pricing
- https://documentation.onesignal.com/reference/create-message
