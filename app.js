import { ANSWERS, answerLabel, currentWeek, localDateISO, selectQuestion, validateBackup } from "./core.js";
import { clearAllData, getAnswers, getSetting, replaceAnswers, saveAnswer, setSetting } from "./db.js";

const app = document.querySelector("#app");
const config = window.KENKYO_CONFIG ?? {};
const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
let questions = [];
let installPrompt = null;
let toastTimer;
let oneSignalPromise = null;

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

async function renderToday() {
  const history = await getAnswers();
  const today = localDateISO();
  const existing = history.find((row) => row.date === today);
  const question = existing ? questions.find((q) => q.id === existing.questionId) : selectQuestion(questions, history);
  const week = currentWeek(history);
  app.innerHTML = `
    <section class="hero"><p class="date">${formatJapaneseDate().toUpperCase()}</p><h2>今日の自分に、<br>静かな問いを。</h2><p>正解はありません。今の感覚にいちばん近いものを選んでください。</p></section>
    <section class="card question-card"><span class="number">TODAY'S QUESTION</span><div class="question">${escapeHtml(question.text)}</div></section>
    <div class="choices" aria-label="回答を選択">
      ${ANSWERS.map((answer) => `<button class="choice ${existing?.answer === answer ? "selected" : ""}" data-answer="${answer}" ${existing ? "disabled" : ""}><span>${answerLabel(answer)}</span><span>${existing?.answer === answer ? "✓" : "○"}</span></button>`).join("")}
    </div>
    ${existing ? `<p class="notice">今日は「${answerLabel(existing.answer)}」と記録しました。回答は1日1回です。また明日、ここで振り返りましょう。</p>` : ""}
    <h3 class="section-title">今週の足あと</h3>
    <section class="card"><div class="week">${week.days.map((day, i) => `<div class="day"><span>${weekdays[i]}</span><div class="dot ${day.answer ?? ""}">${day.answer ? "•" : ""}</div></div>`).join("")}</div></section>`;
  app.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", async () => {
    await saveAnswer({ date: today, questionId: question.id, answer: button.dataset.answer, answeredAt: new Date().toISOString() });
    showToast("今日の振り返りを保存しました");
    await renderToday();
  }));
}

async function renderHistory() {
  const history = (await getAnswers()).reverse();
  const week = currentWeek([...history].reverse());
  app.innerHTML = `<section class="hero"><p class="date">YOUR REFLECTIONS</p><h2>これまでの足あと</h2><p>記録はこの端末の中だけに保存されています。</p></section>
    <section class="card"><div class="setting-line"><div><strong>今週 ${week.answered}日</strong><p>できた ${week.counts.yes} ・ できなかった ${week.counts.no} ・ どちらとも ${week.counts.unsure}</p></div></div></section>
    <h3 class="section-title">回答履歴</h3>
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
  if (oneSignalPromise) return oneSignalPromise;
  let rejectLoad;
  oneSignalPromise = new Promise((resolve, reject) => {
    rejectLoad = reject;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({ appId: config.oneSignalAppId, serviceWorkerParam: { scope: "/push/onesignal/" }, serviceWorkerPath: "/push/onesignal/OneSignalSDKWorker.js", notifyButton: { enable: false } });
        resolve(OneSignal);
      } catch (error) { oneSignalPromise = null; reject(error); }
    });
  });
  if (!document.querySelector('script[data-onesignal-sdk]')) {
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

async function syncSubscription(enabled) {
  if (!config.apiBase) throw new Error("通知APIは公開準備中です。");
  const OneSignal = await oneSignal();
  if (enabled) {
    await OneSignal.Notifications.requestPermission();
    if (!OneSignal.Notifications.permission) throw new Error("通知が許可されていません。端末の設定をご確認ください。");
    await OneSignal.User.PushSubscription.optIn();
  }
  const subscriptionId = OneSignal.User.PushSubscription.id;
  if (!subscriptionId) throw new Error("通知購読を作成できませんでした。");
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
  app.innerHTML = `<section class="hero"><p class="date">YOUR SPACE</p><h2>設定</h2><p>通知と、この端末に保存する記録を管理できます。</p></section>
    <h3 class="section-title">毎日の通知</h3><section class="card">
      <div class="setting"><div class="setting-line"><div><strong>通知を受け取る</strong><p>状態：${notificationStatus()}</p></div><label class="switch"><input id="notification-toggle" type="checkbox" ${enabled ? "checked" : ""}><span></span></label></div></div>
      <div class="setting"><div class="setting-line"><div><strong>通知時刻</strong><p>15分単位で設定します</p></div><input id="notification-time" type="time" step="900" value="${time}"></div></div>
      <div class="setting"><strong>通知の停止と削除</strong><p>購読を解除すると、サーバー上の通知設定も削除します。</p><div class="button-row"><button id="unsubscribe" class="btn danger">通知購読を解除</button></div></div>
      ${!config.oneSignalAppId ? `<p class="notice">現在のローカル版には通知サービスの公開設定がまだ入っていません。アプリの回答・履歴・オフライン動作は確認できます。</p>` : ""}
    </section>
    <h3 class="section-title">ホーム画面に追加</h3><section class="card"><p class="notice">${iosGuide}</p>${!isStandalone() ? `<button id="install" class="btn primary">ホーム画面に追加する</button>` : `<p>インストール済みです。</p>`}</section>
    <h3 class="section-title">データ管理</h3><section class="card">
      <div class="setting"><strong>履歴の引っ越し</strong><p>回答履歴をJSONファイルとして保存・復元できます。ファイルはご自身で安全に保管してください。</p><div class="button-row"><button id="export" class="btn">エクスポート</button><button id="import-button" class="btn">インポート</button><input id="import-file" class="sr-only" type="file" accept="application/json"></div></div>
      <div class="setting"><strong>端末内データを削除</strong><p>回答履歴と設定をこの端末から消去します。元に戻せません。</p><div class="button-row"><button id="clear-data" class="btn danger">すべて削除</button></div></div>
      <div class="setting"><a class="btn" href="/privacy.html">プライバシーポリシー</a></div>
    </section>`;

  app.querySelector("#notification-toggle").addEventListener("change", async (event) => {
    event.target.disabled = true;
    try { await syncSubscription(event.target.checked); enabled = event.target.checked; showToast(event.target.checked ? "通知を有効にしました" : "通知を停止しました"); }
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

fetch("/questions.json").then((response) => { if (!response.ok) throw new Error("質問データを読み込めませんでした。"); return response.json(); }).then((data) => { questions = data; return render(); }).catch((error) => { app.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; });
