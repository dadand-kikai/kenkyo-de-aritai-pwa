import { ANSWERS, answerLabel, currentWeek, localDateISO, selectQuestion, validateBackup } from "./core.js";
import { clearAllData, getAnswers, getSetting, replaceAnswers, saveAnswer, setSetting } from "./db.js";

const app = document.querySelector("#app");
const config = window.KENKYO_CONFIG ?? {};
const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
let questions = [];
let installPrompt = null;
let toastTimer;
let oneSignalPromise = null;
let oneSignalInstance = null;
let oneSignalBooting = Boolean(config.oneSignalAppId);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function route() {
  const value = location.hash.replace("#", "") || "today";
  return ["today", "history", "settings"].includes(value) ? value : "today";
}

function formatJapaneseDate(date = new Date()) {
  return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "静かな夜ですね";
  if (hour < 11) return "おはようございます";
  if (hour < 17) return "少し、立ち止まりませんか";
  return "今日も、おつかれさまでした";
}

function categoryLabel(category) {
  return { confidence: "自信との付き合い方", intellectual: "考えをひらく", respect: "相手を見つめる", listening: "耳を澄ます", gratitude: "支えに気づく", repair: "結び直す", learning: "学びの芽", self: "自分を認める", behavior: "小さな行動", meta: "見方を見つめる", anchor: "今日を見つめる" }[category] ?? "今日を見つめる";
}

function categorySymbol(category) {
  return { listening: "≈", gratitude: "✦", repair: "↺", learning: "⌁", confidence: "△", respect: "◎", intellectual: "◇", self: "○", behavior: "→", meta: "…", anchor: "◌" }[category] ?? "◌";
}

function answerSymbol(answer) {
  return { yes: "✦", no: "○", unsure: "≈" }[answer] ?? "○";
}

async function renderToday() {
  const history = await getAnswers();
  const today = localDateISO();
  const existing = history.find((row) => row.date === today);
  const question = existing ? questions.find((q) => q.id === existing.questionId) : selectQuestion(questions, history);
  const week = currentWeek(history);
  const category = question.category ?? "anchor";
  app.innerHTML = `
    <section class="hero"><p class="date">${formatJapaneseDate()}</p><h2>${greeting()}</h2><p>ひと呼吸おいて、今日の見方を確かめましょう。</p></section>
    <section class="card question-card">
      <div class="question-heading"><span class="question-motif">${categorySymbol(category)}</span><div><span class="number">今日の問い</span><span class="category">${categoryLabel(category)}</span></div></div>
      <div class="question">${escapeHtml(question.text)}</div>
      <p class="question-helper">正解はありません。いちばん近いものを選んでください。</p>
      ${existing ? `<div class="answered-panel"><span class="answered-star">✦</span><strong>今日も、立ち止まって考えました。</strong><span class="answer-chip">今日の答え&nbsp; · &nbsp;${answerLabel(existing.answer)}</span></div>` : `<div class="choices" aria-label="回答を選択">${ANSWERS.map((answer) => `<button class="choice choice-${answer}" data-answer="${answer}"><span>${answerSymbol(answer)}&nbsp;&nbsp;${answerLabel(answer)}</span></button>`).join("")}</div>`}
    </section>
    <section class="card week-card"><h3 class="section-title">この7日間</h3><p>${week.answered ? `この7日間に、${week.answered}回立ち止まりました。` : "まだ記録はありません。今日からで大丈夫です。"}</p><div class="week">${week.days.map((day, i) => `<div class="day"><span>${weekdays[i]}</span><div class="dot ${day.answer ?? ""}">${day.answer ? "•" : ""}</div></div>`).join("")}</div></section>`;
  app.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", async () => {
    await saveAnswer({ date: today, questionId: question.id, answer: button.dataset.answer, answeredAt: new Date().toISOString() });
    showToast("今日の振り返りを保存しました");
    await renderToday();
  }));
}

async function renderHistory() {
  const history = (await getAnswers()).reverse();
  const week = currentWeek([...history].reverse());
  app.innerHTML = `<section class="hero"><h2>振り返りの小径</h2><p>答えた日を、良し悪しをつけずに眺めます。</p></section>
    <section class="card week-card"><h3 class="section-title">${week.answered ? `今週、${week.answered}回振り返りました` : "今週は、まだ静かな余白です"}</h3><p>空いている日も、そのままで大丈夫です。</p><div class="week">${week.days.map((day, i) => `<div class="day"><span>${weekdays[i]}</span><div class="dot ${day.answer ?? ""}">${day.answer ? "•" : ""}</div></div>`).join("")}</div></section>
    <h3 class="section-title section-heading">これまでの問い</h3>
    <section class="card">${history.length ? history.map((row) => {
      const question = questions.find((q) => q.id === row.questionId);
      return `<article class="history-row"><time>${escapeHtml(row.date)}</time><p>${escapeHtml(question?.text ?? row.questionId)}</p><span class="answer-chip">${answerLabel(row.answer)}</span></article>`;
    }).join("") : `<div class="empty">まだ記録はありません。<br>今日の問いから、最初の一歩を残してみましょう。</div>`}</section>`;
}

function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
function isStandalone() { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
function notificationStatus() {
  if (!("Notification" in window)) return "このブラウザは通知に対応していません";
  return { granted: "許可済み", denied: "ブロックされています", default: "未設定" }[Notification.permission];
}

async function deviceCredentials() {
  let credentials = await getSetting("deviceCredentials");
  if (!credentials) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    credentials = { deviceId: crypto.randomUUID(), secret: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") };
    await setSetting("deviceCredentials", credentials);
  }
  return credentials;
}

async function oneSignal() {
  if (!config.oneSignalAppId) throw new Error("通知サービスは公開準備中です。");
  if (oneSignalInstance) return oneSignalInstance;
  if (oneSignalPromise) return oneSignalPromise;
  let rejectLoad;
  oneSignalPromise = new Promise((resolve, reject) => {
    rejectLoad = reject;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        if (!window.__KENKYO_ONESIGNAL_READY__) {
          try {
            await OneSignal.init({ appId: config.oneSignalAppId, safari_web_id: config.oneSignalSafariWebId, serviceWorkerParam: { scope: "/push/onesignal/" }, serviceWorkerPath: "push/onesignal/OneSignalSDKWorker.js", notifyButton: { enable: false }, welcomeNotification: { disable: true } });
          } catch (error) {
            if (!/already initialized/i.test(error?.message)) throw error;
          }
          window.__KENKYO_ONESIGNAL_READY__ = true;
        }
        oneSignalInstance = OneSignal;
        resolve(OneSignal);
      } catch (error) {
        oneSignalPromise = null;
        reject(error);
      }
    });
  });
  if (!window.OneSignal && !document.querySelector('script[data-onesignal-sdk]')) {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const script = document.createElement("script");
    script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    script.defer = true;
    script.dataset.onesignalSdk = "true";
    script.onerror = () => { oneSignalPromise = null; rejectLoad(new Error("通知サービスを読み込めませんでした。")); };
    document.head.append(script);
  }
  return oneSignalPromise;
}

async function waitForSubscriptionId(OneSignal, timeoutMs = 20000) {
  const existing = OneSignal.User.PushSubscription.id;
  if (existing) return existing;
  return new Promise((resolve, reject) => {
    let finished = false;
    let poll;
    let timeout;
    const finish = (value, error) => {
      if (finished) return;
      finished = true;
      clearInterval(poll);
      clearTimeout(timeout);
      try { OneSignal.User.PushSubscription.removeEventListener("change", onChange); } catch {}
      if (error) reject(error); else resolve(value);
    };
    const currentId = (event) => event?.current?.id || OneSignal.User.PushSubscription.id;
    const onChange = (event) => { const id = currentId(event); if (id) finish(id); };
    try { OneSignal.User.PushSubscription.addEventListener("change", onChange); } catch {}
    poll = setInterval(() => { const id = OneSignal.User.PushSubscription.id; if (id) finish(id); }, 250);
    timeout = setTimeout(() => finish(null, new Error("通知購読の作成に時間がかかっています。通信状態を確認して、もう一度お試しください。")), timeoutMs);
  });
}

async function syncSubscription(enabled) {
  if (!config.apiBase) throw new Error("通知APIは公開準備中です。");
  const OneSignal = oneSignalInstance || await oneSignal();
  if (enabled) {
    await OneSignal.Notifications.requestPermission();
    if (!OneSignal.Notifications.permission) throw new Error("通知が許可されていません。端末の設定をご確認ください。");
    await OneSignal.User.PushSubscription.optIn();
  }
  const subscriptionId = await waitForSubscriptionId(OneSignal);
  const credentials = await deviceCredentials();
  const time = (await getSetting("notificationTime")) ?? "21:30";
  const [hours, minutes] = time.split(":").map(Number);
  const response = await fetch(`${config.apiBase}/api/subscription`, {
    method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${credentials.secret}` },
    body: JSON.stringify({ deviceId: credentials.deviceId, subscriptionId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, minuteOfDay: hours * 60 + minutes, enabled })
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "通知設定を保存できませんでした。");
  await setSetting("notificationEnabled", enabled);
}

async function deleteSubscription() {
  const credentials = await getSetting("deviceCredentials");
  if (credentials && config.apiBase) await fetch(`${config.apiBase}/api/subscription`, { method: "DELETE", headers: { authorization: `Bearer ${credentials.secret}`, "x-device-id": credentials.deviceId } });
  if (config.oneSignalAppId) { const OneSignal = await oneSignal(); await OneSignal.User.PushSubscription.optOut(); }
  await setSetting("notificationEnabled", false);
}

async function renderSettings() {
  const time = (await getSetting("notificationTime")) ?? "21:30";
  let enabled = (await getSetting("notificationEnabled")) ?? false;
  const iosGuide = isIos() && !isStandalone() ? "iPhoneでは先にSafariの共有ボタンから「ホーム画面に追加」し、追加したアイコンから開いてください。" : "ブラウザのメニューからホーム画面へ追加できます。";
  app.innerHTML = `<section class="hero"><h2>心地よい距離に</h2><p>問いとの付き合い方を、ここで整えられます。</p></section>
    <section class="card settings-card"><h3 class="section-title card-title">✦&nbsp; 毎日の通知</h3>
      <div class="setting"><div class="setting-line"><div><strong>通知を受け取る</strong><p>状態：${oneSignalBooting ? "通知サービスを準備中" : notificationStatus()}</p></div><label class="switch"><input id="notification-toggle" type="checkbox" ${enabled ? "checked" : ""} ${oneSignalBooting ? "disabled" : ""}><span></span></label></div></div>
      <div class="setting"><div class="setting-line"><div><strong>通知時刻</strong><p>15分単位で設定します</p></div><input id="notification-time" type="time" step="900" value="${time}"></div></div>
      <div class="setting"><strong>通知の停止と削除</strong><p>購読を解除すると、サーバー上の通知設定も削除します。</p><div class="button-row"><button id="unsubscribe" class="btn danger">通知購読を解除</button></div></div>
      ${!config.oneSignalAppId ? `<p class="notice">現在のローカル版には通知サービスの公開設定がまだ入っていません。アプリの回答・履歴・オフライン動作は確認できます。</p>` : ""}
    </section>
    <section class="card settings-card"><h3 class="section-title card-title">◌&nbsp; ホーム画面</h3><p class="notice">${iosGuide}</p>${!isStandalone() ? `<button id="install" class="btn primary full-width">ホーム画面に追加する</button>` : `<p>インストール済みです。</p>`}</section>
    <section class="card settings-card"><h3 class="section-title card-title">端末内のデータ</h3>
      <div class="setting"><strong>履歴の引っ越し</strong><p>回答履歴をJSONファイルとして保存・復元できます。ファイルはご自身で安全に保管してください。</p><div class="button-row"><button id="export" class="btn">エクスポート</button><button id="import-button" class="btn">インポート</button><input id="import-file" class="sr-only" type="file" accept="application/json"></div></div>
      <div class="setting"><strong>端末内データを削除</strong><p>回答履歴と設定をこの端末から消去します。元に戻せません。</p><div class="button-row"><button id="clear-data" class="btn danger">すべて削除</button></div></div>
      <div class="setting"><a class="btn" href="/privacy.html">プライバシーポリシー</a></div>
    </section>`;

  app.querySelector("#notification-toggle").addEventListener("change", async (event) => {
    event.target.disabled = true;
    try { await syncSubscription(event.target.checked); enabled = event.target.checked; showToast(event.target.checked ? "通知を有効にしました" : "通知を停止しました"); await renderSettings(); }
    catch (error) { event.target.checked = !event.target.checked; showToast(error.message); }
    event.target.disabled = false;
  });
  app.querySelector("#notification-time").addEventListener("change", async (event) => {
    const [h, m] = event.target.value.split(":").map(Number);
    const total = (h * 60 + Math.round(m / 15) * 15) % 1440;
    const rounded = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    event.target.value = rounded; await setSetting("notificationTime", rounded);
    if (enabled) { try { await syncSubscription(true); } catch (error) { showToast(error.message); return; } }
    showToast("通知時刻を保存しました");
  });
  app.querySelector("#unsubscribe").addEventListener("click", async () => { try { await deleteSubscription(); showToast("通知購読を解除しました"); await renderSettings(); } catch (error) { showToast(error.message); } });
  app.querySelector("#install")?.addEventListener("click", async () => {
    if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; }
    else showToast(isIos() ? "Safariの共有ボタンから「ホーム画面に追加」を選んでください" : "ブラウザのメニューから「アプリをインストール」を選んでください");
  });
  app.querySelector("#export").addEventListener("click", async () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), answers: await getAnswers() }, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `kenkyo-backup-${localDateISO()}.json`; link.click(); URL.revokeObjectURL(link.href);
  });
  app.querySelector("#import-button").addEventListener("click", () => app.querySelector("#import-file").click());
  app.querySelector("#import-file").addEventListener("change", async (event) => { try { const backup = validateBackup(JSON.parse(await event.target.files[0].text())); await replaceAnswers(backup.answers); showToast("回答履歴を復元しました"); } catch (error) { showToast(error.message); } });
  app.querySelector("#clear-data").addEventListener("click", async () => { if (confirm("回答履歴と設定をすべて削除しますか？")) { await deleteSubscription().catch(() => {}); await clearAllData(); showToast("端末内データを削除しました"); await renderSettings(); } });
}

async function render() {
  document.querySelectorAll("[data-route]").forEach((item) => item.classList.toggle("active", item.dataset.route === route()));
  ({ today: renderToday, history: renderHistory, settings: renderSettings })[route()]().catch((error) => { app.innerHTML = `<div class="empty">読み込みに失敗しました。<br>${escapeHtml(error.message)}</div>`; });
  window.scrollTo(0, 0);
}

window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; });
window.addEventListener("hashchange", render);
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));

if (config.oneSignalAppId) {
  oneSignal().catch((error) => console.warn("OneSignal preparation failed", error)).finally(() => {
    oneSignalBooting = false;
    if (route() === "settings") renderSettings();
  });
}

fetch("/questions.json").then((response) => { if (!response.ok) throw new Error("質問データを読み込めませんでした。"); return response.json(); }).then((data) => { questions = data; return render(); }).catch((error) => { app.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; });
