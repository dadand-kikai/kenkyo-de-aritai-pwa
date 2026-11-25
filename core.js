export const ANSWERS = Object.freeze(["yes", "no", "unsure"]);

export function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function epochDay(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

export function selectQuestion(questions, history, date = new Date()) {
  const anchor = questions.find((q) => q.id === "anchor") ?? questions[0];
  const anchors = history.filter((row) => row.questionId === "anchor");
  const latestFive = anchors.slice(-5);
  const yes = latestFive.filter((row) => row.answer === "yes").length;
  const unsure = latestFive.filter((row) => row.answer === "unsure").length;
  let consecutiveNo = 0;
  for (let i = anchors.length - 1; i >= 0 && anchors[i].answer === "no"; i -= 1) consecutiveNo += 1;

  let category = null;
  if (anchors.length >= 5 && yes >= 4) category = "self";
  else if (anchors.length >= 5 && unsure >= 3) category = "behavior";
  else if (consecutiveNo >= 10) category = "meta";
  else if (consecutiveNo >= 7) category = "behavior";
  else if (consecutiveNo >= 5) category = history.length % 2 === 0 ? "intellectual" : "listening";
  else if (consecutiveNo >= 3) category = history.length % 2 === 0 ? "respect" : "confidence";
  else if (history.length > 0 && history.length % 7 === 0) {
    const rotation = ["gratitude", "repair", "learning", "listening", "confidence", "respect", "intellectual"];
    category = rotation[(Math.floor(history.length / 7) - 1) % rotation.length];
  }

  const recentVariant = history.slice(-2).some((row) => row.questionId !== "anchor");
  if (!category || recentVariant) return anchor;
  const candidates = questions.filter((q) => q.category === category);
  if (!candidates.length) return anchor;
  const used = new Set(history.slice(-30).map((row) => row.questionId));
  const start = ((epochDay(date) % candidates.length) + candidates.length) % candidates.length;
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(start + offset) % candidates.length];
    if (!used.has(candidate.id)) return candidate;
  }
  return candidates[start];
}

export function currentWeek(history, today = new Date()) {
  const day = (today.getDay() + 6) % 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - day);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = localDateISO(date);
    return { date: iso, answer: history.find((row) => row.date === iso)?.answer ?? null };
  });
  const counts = Object.fromEntries(ANSWERS.map((answer) => [answer, days.filter((d) => d.answer === answer).length]));
  return { days, counts, answered: days.filter((d) => d.answer).length };
}

export function answerLabel(answer) {
  return { yes: "あった", no: "なかった", unsure: "わからない" }[answer] ?? "";
}

export function validateBackup(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.answers)) throw new Error("対応していないバックアップ形式です。")
  for (const row of value.answers) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || typeof row.questionId !== "string" || !ANSWERS.includes(row.answer)) {
      throw new Error("回答データに不正な項目があります。")
    }
  }
  return value;
}
