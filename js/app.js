/* Student quiz flow.
   Screens: start → one question per screen → confirm → results.
   All answers held in memory; nothing is saved until submit.
   The results screen NEVER depends on the network: the POST to
   the Apps Script backend happens after results are rendered,
   and a failure only shows a small note with a retry button.
*/

(function () {
  "use strict";

  const app = document.getElementById("app");
  const live = document.getElementById("live");

  // ---------- state ----------
  let quiz = null;          // validated quiz object
  let order = [];           // question array (quiz order preserved)
  let current = 0;          // index into order
  let answers = {};         // questionId -> optionId
  let classCode = "";
  let studentLabel = "";
  let startedAt = null;     // ISO string
  let attemptNumber = 1;
  let timerHandle = null;

  const params = new URLSearchParams(location.search);
  const quizId = params.get("quiz");

  // ---------- tiny DOM helpers (textContent only — no HTML injection) ----------
  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function announce(msg) { live.textContent = ""; setTimeout(() => (live.textContent = msg), 50); }

  function attemptsKey() { return "attempts:" + quiz.quizId; }
  function priorAttempts() {
    try { return parseInt(localStorage.getItem(attemptsKey()) || "0", 10) || 0; }
    catch (e) { return 0; }
  }
  function recordAttempt(n) {
    try { localStorage.setItem(attemptsKey(), String(n)); } catch (e) { /* private mode: fine */ }
  }

  // ---------- loud failure ----------
  function showErrors(title, errors) {
    clear(app);
    const box = el("div", "notice problem");
    box.appendChild(el("h2", null, title));
    const ul = el("ul");
    errors.forEach((e) => ul.appendChild(el("li", null, e)));
    box.appendChild(ul);
    box.appendChild(el("p", "muted", "This quiz will not be shown until the file is fixed."));
    app.appendChild(box);
    announce(title);
  }

  // ---------- boot: fetch manifest + quiz, validate ----------
  async function boot() {
    if (!quizId) {
      showErrors("No quiz selected", ["Open a quiz from the quiz list, or use a link like quiz.html?quiz=your-quiz-id."]);
      return;
    }
    let indexData;
    try {
      const r = await fetch("quizzes/index.json", { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      indexData = await r.json();
    } catch (e) {
      showErrors("Could not load quizzes/index.json", [e.message]);
      return;
    }
    const idxErrs = validateIndex(indexData);
    if (idxErrs.length) { showErrors("index.json has problems", idxErrs); return; }

    const entry = indexData.quizzes.find((q) => q.quizId === quizId);
    if (!entry) {
      showErrors("Quiz not found", ['No quiz with id "' + quizId + '" is listed in index.json.']);
      return;
    }

    let quizData;
    const fileName = "quizzes/" + entry.file;
    try {
      const r = await fetch(fileName, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      quizData = await r.json();
    } catch (e) {
      showErrors("Could not load " + fileName, [
        e instanceof SyntaxError ? "The file is not valid JSON: " + e.message : e.message,
      ]);
      return;
    }

    const errs = validateQuiz(quizData, entry.quizId, entry.file);
    if (errs.length) { showErrors("This quiz file has problems and cannot run", errs); return; }

    quiz = quizData;
    order = quiz.questions;
    document.title = quiz.title;
    renderStart();
  }

  // ---------- Screen 1: start ----------
  function renderStart() {
    clear(app);

    const head = el("div");
    head.appendChild(el("h1", null, quiz.title));
    if (quiz.subtitle) head.appendChild(el("p", "muted", quiz.subtitle));
    head.appendChild(
      el("p", "muted",
        [quiz.yearLevel, order.length + " questions",
         quiz.durationMinutes ? "about " + quiz.durationMinutes + " minutes" : null]
          .filter(Boolean).join(" · "))
    );
    app.appendChild(head);

    if (quiz.intro) {
      const intro = el("div", "card");
      intro.appendChild(el("p", null, quiz.intro));
      app.appendChild(intro);
    }

    if (priorAttempts() > 0) {
      app.appendChild(el("div", "notice",
        "You have done this quiz before. You can do it again — your first attempt is the one your teacher looks at."));
    }

    const form = el("div", "card");

    const f1 = el("div", "field");
    const l1 = el("label", null, "Class");
    l1.htmlFor = "class-code";
    const sel = el("select");
    sel.id = "class-code";
    sel.required = true;
    sel.appendChild(new Option("Choose your class…", "", true, true));
    sel.options[0].disabled = true;
    quiz.classCodes.forEach((c) => sel.appendChild(new Option(c, c)));
    f1.append(l1, sel);

    const f2 = el("div", "field");
    const l2 = el("label", null, "Your name");
    l2.htmlFor = "student-label";
    const inp = el("input");
    inp.type = "text";
    inp.id = "student-label";
    inp.maxLength = 20;
    inp.placeholder = "e.g. Aroha T";
    inp.autocomplete = "off";
    inp.required = true;
    const help = el("p", "help muted", "First name and last initial only.");
    f2.append(l2, inp, help);

    const err = el("p", "notice problem");
    err.hidden = true;

    const startBtn = el("button", null, "Start");
    startBtn.addEventListener("click", () => {
      const cc = sel.value;
      const label = inp.value.trim().slice(0, 20);
      if (!cc || !label) {
        err.textContent = !cc && !label
          ? "Choose your class and enter your name to start."
          : !cc ? "Choose your class to start." : "Enter your name to start.";
        err.hidden = false;
        (!cc ? sel : inp).focus();
        return;
      }
      classCode = cc;
      studentLabel = label;
      startedAt = new Date().toISOString();
      attemptNumber = priorAttempts() + 1;
      answers = {};
      current = 0;
      startTimer();
      renderQuestion();
    });

    form.append(f1, f2, err, startBtn);
    app.appendChild(form);
  }

  // ---------- timer: display only, never submits, never locks ----------
  let secondsLeft = null;
  function startTimer() {
    if (!quiz.durationMinutes) return;
    secondsLeft = quiz.durationMinutes * 60;
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      if (secondsLeft > 0) secondsLeft -= 1;
      const t = document.getElementById("timer");
      if (t) t.textContent = timerText();
    }, 1000);
  }
  function timerText() {
    if (secondsLeft === null) return "";
    if (secondsLeft <= 0) return "Suggested time is up — keep going, nothing is locked.";
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return m + ":" + String(s).padStart(2, "0") + " left";
  }
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

  // ---------- Screen 2: one question per screen ----------
  function renderQuestion() {
    clear(app);
    const q = order[current];

    const prog = el("div", "progress");
    prog.appendChild(el("span", null, "Question " + (current + 1) + " of " + order.length));
    if (quiz.durationMinutes) {
      const t = el("span", "timer", timerText());
      t.id = "timer";
      prog.appendChild(t);
    }
    app.appendChild(prog);

    const fs = el("fieldset");
    const lg = el("legend", null, q.stem);
    fs.appendChild(lg);

    const nextBtn = el("button", null, current === order.length - 1 ? "Submit" : "Next");
    nextBtn.disabled = !answers[q.id];

    q.options.forEach((opt) => {
      const label = el("label", "option");
      const radio = el("input");
      radio.type = "radio";
      radio.name = "q-" + q.id;
      radio.value = opt.id;
      radio.checked = answers[q.id] === opt.id;
      radio.addEventListener("change", () => {
        answers[q.id] = opt.id;
        nextBtn.disabled = false;
      });
      const body = el("span", "option-body");
      const mark = el("span", "mark", "\u2713"); // check appears when selected
      mark.setAttribute("aria-hidden", "true");
      body.append(mark, el("span", null, opt.text));
      label.append(radio, body);
      fs.appendChild(label);
    });
    app.appendChild(fs);

    const row = el("div", "btn-row");
    const backBtn = el("button", "secondary", "Back");
    backBtn.disabled = current === 0;
    backBtn.addEventListener("click", () => { if (current > 0) { current -= 1; renderQuestion(); } });
    nextBtn.addEventListener("click", () => {
      if (!answers[q.id]) return;
      if (current === order.length - 1) renderConfirm();
      else { current += 1; renderQuestion(); }
    });
    row.append(backBtn, nextBtn);
    app.appendChild(row);

    const first = fs.querySelector("input:checked") || fs.querySelector("input");
    if (first) first.focus();
  }

  // ---------- confirm ----------
  function renderConfirm() {
    clear(app);
    const card = el("div", "card");
    card.appendChild(el("h2", null, "Submit your answers?"));
    card.appendChild(el("p", null, "You will see how you did."));
    const row = el("div", "btn-row");
    const back = el("button", "secondary", "Go back");
    back.addEventListener("click", renderQuestion);
    const submit = el("button", null, "Submit");
    submit.addEventListener("click", finishQuiz);
    row.append(back, submit);
    card.appendChild(row);
    app.appendChild(card);
    submit.focus();
  }

  // ---------- scoring ----------
  function correctOption(q) { return q.options.find((o) => o.correct === true); }
  function chosenOption(q) { return q.options.find((o) => o.id === answers[q.id]); }

  function finishQuiz() {
    stopTimer();
    const submittedAt = new Date().toISOString();
    const responses = order.map((q) => ({
      questionId: q.id,
      selectedOptionId: answers[q.id],
      correct: answers[q.id] === correctOption(q).id,
    }));
    const score = responses.filter((r) => r.correct).length;

    recordAttempt(attemptNumber);
    renderResults(score, responses, submittedAt);   // results FIRST —
    postResults(score, responses, submittedAt);     // network second, never blocking
  }

  // ---------- Screen 3: results ----------
  function verdictBlock(kind, labelPrefix, optionText, why) {
    const v = el("div", "verdict " + kind);
    const icon = el("span", "icon", kind === "correct" ? "\u2713" : "\u2715");
    icon.setAttribute("aria-hidden", "true");
    const body = el("div");
    const line = el("p");
    line.appendChild(el("strong", null, labelPrefix + ": "));
    line.appendChild(document.createTextNode(optionText + " — "));
    line.appendChild(el("span", "verdict-word", kind === "correct" ? "Correct" : "Incorrect"));
    body.appendChild(line);
    body.appendChild(el("p", "why", why));
    v.append(icon, body);
    return v;
  }

  function renderResults(score, responses, submittedAt) {
    clear(app);

    // print-only header
    const ph = el("div", "print-header");
    ph.appendChild(el("div", "ph-title", quiz.title));
    ph.appendChild(el("div", null,
      classCode + " · " + studentLabel + " · " + new Date(submittedAt).toLocaleDateString("en-NZ") +
      " · Score " + score + " out of " + order.length));
    app.appendChild(ph);

    const scoreLine = el("p", "score-line", score + " out of " + order.length);
    app.appendChild(scoreLine);
    announce("You scored " + score + " out of " + order.length + ".");

    const wrong = order.filter((q) => answers[q.id] !== correctOption(q).id);
    const right = order.filter((q) => answers[q.id] === correctOption(q).id);

    if (wrong.length) {
      app.appendChild(el("h2", null, "Questions you got wrong"));
      wrong.forEach((q) => {
        const d = el("details", "result-q");
        d.open = true; // expanded by default
        const s = el("summary", "stem", q.stem);
        d.appendChild(s);
        const body = el("div", "details-body");
        const yours = chosenOption(q);
        const corr = correctOption(q);
        body.appendChild(verdictBlock("incorrect", "Your answer", yours.text, yours.why));
        body.appendChild(verdictBlock("correct", "Correct answer", corr.text, corr.why));
        d.appendChild(body);
        app.appendChild(d);
      });
    }

    if (right.length) {
      app.appendChild(el("h2", null, "Questions you got right"));
      right.forEach((q) => {
        const d = el("details", "result-q"); // collapsed by default
        const s = el("summary", "stem", q.stem);
        d.appendChild(s);
        const body = el("div", "details-body");
        const corr = correctOption(q);
        body.appendChild(verdictBlock("correct", "Your answer", corr.text, corr.why));
        d.appendChild(body);
        app.appendChild(d);
      });
    }

    // network status slot (filled by postResults)
    const net = el("div");
    net.id = "net-status";
    app.appendChild(net);

    const row = el("div", "btn-row");
    const save = el("button", "secondary", "Save my results");
    save.addEventListener("click", () => window.print());
    const again = el("button", "secondary", "Try again");
    again.addEventListener("click", () => {
      answers = {};
      current = 0;
      startedAt = new Date().toISOString();
      attemptNumber = priorAttempts() + 1;
      startTimer();
      renderQuestion();
    });
    row.append(save, again);
    app.appendChild(row);
  }

  // expand everything for printing, restore afterwards
  let printClosed = [];
  window.addEventListener("beforeprint", () => {
    printClosed = [...document.querySelectorAll("details:not([open])")];
    printClosed.forEach((d) => (d.open = true));
  });
  window.addEventListener("afterprint", () => {
    printClosed.forEach((d) => (d.open = false));
    printClosed = [];
  });

  // ---------- POST to backend (never blocks results) ----------
  async function postResults(score, responses, submittedAt) {
    const slot = document.getElementById("net-status");
    if (!slot) return;
    clear(slot);

    if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.indexOf("http") !== 0) {
      // backend not configured yet — say so quietly, don't alarm students
      slot.appendChild(el("p", "notice network muted",
        "Results shown. Saving to the teacher's sheet is not set up on this site yet."));
      return;
    }

    const payload = {
      secret: CONFIG.SHARED_SECRET,
      quizId: quiz.quizId,
      classCode: classCode,
      studentLabel: studentLabel,
      attemptNumber: attemptNumber,
      startedAt: startedAt,
      submittedAt: submittedAt,
      score: score,
      total: order.length,
      responses: responses,
    };

    let ok = false;
    try {
      const r = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        // text/plain keeps this a CORS "simple request" — Apps Script
        // does not answer preflight OPTIONS requests.
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      ok = data && data.ok === true;
    } catch (e) {
      ok = false;
    }

    if (!ok) {
      const note = el("div", "notice network");
      note.appendChild(el("p", null,
        "Results shown. Could not reach the server, so your teacher may not see this one."));
      const retry = el("button", "secondary", "Try sending again");
      retry.addEventListener("click", () => postResults(score, responses, submittedAt));
      note.appendChild(retry);
      slot.appendChild(note);
    }
    // On success: say nothing. The results are the point.
  }

  boot();
})();
