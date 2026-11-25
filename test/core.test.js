import test from "node:test";
import assert from "node:assert/strict";
import { ANSWERS, answerLabel, currentWeek, selectQuestion, validateBackup } from "../core.js";
import questions from "../questions.json" with { type: "json" };

test("Android版と同じ81問を収録する", () => {
  assert.equal(questions.length, 81);
  assert.equal(questions.filter((q) => q.id === "anchor").length, 1);
  assert.equal(new Set(questions.map((q) => q.id)).size, 81);
});

test("全81問の「ありましたか？」に、保存済みの回答コードで自然に答えられる", () => {
  for (const question of questions) {
    assert.ok(question.text.endsWith("ありましたか？"), question.id);
  }
  assert.deepEqual(ANSWERS, ["yes", "no", "unsure"]);
  assert.deepEqual(ANSWERS.map(answerLabel), ["あった", "なかった", "わからない"]);
});

test("通常日は基準質問を選ぶ", () => {
  assert.equal(selectQuestion(questions, [], new Date(2026, 10, 20)).id, "anchor");
});

test("基準質問で5回中4回「あった」の場合はselfカテゴリへ進む", () => {
  const history = ["yes", "yes", "yes", "no", "yes"].map((answer, i) => ({ date: `2026-11-${i + 1}`, questionId: "anchor", answer }));
  assert.equal(selectQuestion(questions, history, new Date(2026, 10, 20)).category, "self");
});

test("基準質問で3回連続「なかった」の場合はrespect/confidenceへ進む", () => {
  const even = [0, 1, 2, 3].map((i) => ({ date: `2026-11-0${i + 1}`, questionId: "anchor", answer: i ? "no" : "yes" }));
  assert.equal(selectQuestion(questions, even, new Date(2026, 10, 20)).category, "respect");
  assert.equal(selectQuestion(questions, even.slice(1), new Date(2026, 10, 20)).category, "confidence");
});

test("変化質問の後2回答以内は基準質問へ戻る", () => {
  const history = Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 1}`, questionId: "anchor", answer: "no" }));
  history[6].questionId = "behavior_1";
  assert.equal(selectQuestion(questions, history, new Date(2026, 10, 20)).id, "anchor");
});

test("週次集計は月曜始まり", () => {
  const week = currentWeek([{ date: "2026-11-16", answer: "yes" }, { date: "2026-11-20", answer: "no" }], new Date(2026, 10, 20));
  assert.equal(week.days[0].date, "2026-11-16");
  assert.equal(week.days[6].date, "2026-11-22");
  assert.deepEqual(week.counts, { yes: 1, no: 1, unsure: 0 });
});

test("バックアップに不正な回答を受け入れない", () => {
  assert.throws(() => validateBackup({ version: 1, answers: [{ date: "bad", questionId: "anchor", answer: "yes" }] }));
});
