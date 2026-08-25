/* Teacher dashboard.
   The key is entered once per browser session, held in
   sessionStorage, and verified on the SERVER (Apps Script).
   It never appears in this codebase, so view-source reveals
   nothing. Submission rows arrive without student labels —
   the backend strips them — so nothing here can show "who".
*/

(function () {
  "use strict";

  const dash = document.getElementById("dash");
  const KEY_STORE = "dashboardKey";

  let rows = [];          // all submissions (no labels)
  let indexEntries = [];  // from quizzes/index.json
  let quizCache = {};     // quizId -> quiz object
  let state = { quizId: "", classCode: "", firstOnly: true };

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---------- key gate ----------
  function renderKeyForm(message) {
    clear(dash);
    const card = el("div", "card");
    card.appendChild(el("h2", null, "Enter the dashboard key"));
    if (message) card.appendChild(el("p", "notice problem", message));
    const field = el("div", "field");
    const label = el("label", null, "Key");
    label.htmlFor = "dash-key";
    const inp = el("input");
    inp.type = "password";
    inp.id = "dash-key";
    inp.autocomplete = "off";
    field.append(label, inp);
    const btn = el("button", null, "Open dashboard");
    const go = () => {
      const key = inp.value.trim();
      if (!key) { inp.focus(); return; }
      sessionStorage.setItem(KEY_STORE, key);
      boot();
    };
    btn.addEventListener("click", go);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    card.append(field, btn);
    dash.appendChild(card);
    inp.focus();
  }

  // ---------- boot ----------
  async function boot() {
    const key = sessionStorage.getItem(KEY_STORE);
    if (!key) { renderKeyForm(); return; }

    clear(dash);
    dash.appendChild(el("p", "muted", "Loading data…"));

    if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.indexOf("http") !== 0) {
      clear(dash);
      dash.appendChild(el("div", "notice problem",
        "The Apps Script URL has not been set in js/config.js yet. Deploy Code.gs first (see README)."));
      return;
    }

    // 1. quiz manifest (for titles + files)
    try {
      const r = await fetch("quizzes/index.json", { cache: "no-store" });
      indexEntries = (await r.json()).quizzes || [];
    } catch (e) {
      clear(dash);
      dash.appendChild(el("div", "notice problem", "Could not load quizzes/index.json: " + e.message));
      return;
    }

    // 2. submissions — key checked server-side
    try {
      const url = CONFIG.APPS_SCRIPT_URL + "?action=data&key=" + encodeURIComponent(key);
      const r = await fetch(url);
      const data = await r.json();
      if (!data.ok) {
        if (data.error === "forbidden") {
          sessionStorage.removeItem(KEY_STORE);
          renderKeyForm("That key was not accepted. Check it and try again.");
          return;
        }
        throw new Error(data.error || "unknown error");
      }
      rows = data.rows || [];
    } catch (e) {
      clear(dash);
      const box = el("div", "notice problem");
      box.appendChild(el("p", null, "Could not load submissions: " + e.message));
      const retry = el("button", "secondary", "Try again");
      retry.addEventListener("click", boot);
      box.appendChild(retry);
      dash.appendChild(box);
      return;
    }

    if (!state.quizId) {
      const withData = indexEntries.find((q) => rows.some((r) => r.quizId === q.quizId));
      state.quizId = (withData || indexEntries[0] || {}).quizId || "";
    }
    render();
  }

  async function getQuiz(quizId) {
    if (quizCache[quizId]) return quizCache[quizId];
    const entry = indexEntries.find((q) => q.quizId === quizId);
    if (!entry) return null;
    try {
      const r = await fetch("quizzes/" + entry.file, { cache: "no-store" });
      const quiz = await r.json();
      quizCache[quizId] = quiz;
      return quiz;
    } catch (e) {
      return null;
    }
  }

  // ---------- filtering ----------
  function filteredRows() {
    return rows.filter((r) =>
      r.quizId === state.quizId &&
      (!state.classCode || r.classCode === state.classCode) &&
      (!state.firstOnly || r.attemptNumber === 1)
    );
  }

  // ---------- render ----------
  async function render() {
    clear(dash);

    // Controls
    const controls = el("div", "controls");

    const qf = el("div", "field");
    const ql = el("label", null, "Quiz");
    ql.htmlFor = "quiz-sel";
    const qs = el("select");
    qs.id = "quiz-sel";
    indexEntries.forEach((q) => qs.appendChild(new Option(q.title + " (" + (q.yearLevel || "") + ")", q.quizId, false, q.quizId === state.quizId)));
    qs.addEventListener("change", () => { state.quizId = qs.value; state.classCode = ""; render(); });
    qf.append(ql, qs);

    const cf = el("div", "field");
    const cl = el("label", null, "Class");
    cl.htmlFor = "class-sel";
    const cs = el("select");
    cs.id = "class-sel";
    const classes = [...new Set(rows.filter((r) => r.quizId === state.quizId).map((r) => r.classCode))].sort();
    cs.appendChild(new Option("All classes", "", false, state.classCode === ""));
    classes.forEach((c) => cs.appendChild(new Option(c, c, false, c === state.classCode)));
    cs.addEventListener("change", () => { state.classCode = cs.value; render(); });
    cf.append(cl, cs);

    const tf = el("div", "toggle-row");
    const cb = el("input");
    cb.type = "checkbox";
    cb.id = "first-only";
    cb.checked = state.firstOnly; // ON by default
    cb.addEventListener("change", () => { state.firstOnly = cb.checked; render(); });
    const tl = el("label", null, "First attempts only");
    tl.htmlFor = "first-only";
    tf.append(cb, tl);

    const exportBtn = el("button", "secondary", "Export CSV");
    exportBtn.addEventListener("click", exportCsv);

    controls.append(qf, cf, tf, exportBtn);
    dash.appendChild(controls);

    const data = filteredRows();
    const quiz = await getQuiz(state.quizId);

    if (!quiz) {
      dash.appendChild(el("div", "notice problem", "Could not load the quiz file for this quiz, so questions cannot be shown."));
      return;
    }
    if (data.length === 0) {
      dash.appendChild(el("p", "muted", "No submissions match these filters yet."));
      return;
    }

    // ---------- main view: question difficulty, hardest first ----------
    dash.appendChild(el("h2", null, "Most missed questions"));
    dash.appendChild(el("p", "muted",
      data.length + " submission" + (data.length === 1 ? "" : "s") +
      (state.firstOnly ? " (first attempts only)" : " (all attempts)") + "."));

    const stats = quiz.questions.map((q) => {
      let total = 0, wrong = 0;
      const wrongByOption = {};
      data.forEach((row) => {
        const resp = (row.responses || []).find((x) => x.questionId === q.id);
        if (!resp) return;
        total += 1;
        if (!resp.correct) {
          wrong += 1;
          wrongByOption[resp.selectedOptionId] = (wrongByOption[resp.selectedOptionId] || 0) + 1;
        }
      });
      return { q, total, wrong, pctWrong: total ? (wrong / total) * 100 : 0, wrongByOption };
    });
    stats.sort((a, b) => b.pctWrong - a.pctWrong);

    stats.forEach((s) => {
      const high = s.pctWrong > 40;
      const rowEl = el("div", "q-row" + (high ? " high" : ""));

      const head = el("div", "q-head");
      const stem = el("div");
      stem.appendChild(el("strong", null, s.q.stem));
      if (high) stem.appendChild(el("span", "flag-badge", "Start here"));
      const pct = el("div", "pct", Math.round(s.pctWrong) + "% wrong");
      head.append(stem, pct);
      rowEl.appendChild(head);

      const track = el("div", "bar-track");
      const fill = el("div", "bar-fill");
      fill.style.width = Math.min(100, s.pctWrong) + "%";
      track.appendChild(fill);
      track.setAttribute("role", "img");
      track.setAttribute("aria-label", Math.round(s.pctWrong) + " percent wrong");
      rowEl.appendChild(track);

      rowEl.appendChild(el("p", "muted", s.wrong + " wrong / " + s.total + " answered"));

      // which wrong option, and how often — the misconception signal
      const picked = Object.entries(s.wrongByOption).sort((a, b) => b[1] - a[1]);
      if (picked.length) {
        const ul = el("ul", "opt-breakdown");
        picked.forEach(([optId, count]) => {
          const opt = s.q.options.find((o) => o.id === optId);
          const text = opt ? opt.text : 'option "' + optId + '"';
          ul.appendChild(el("li", null, count + " chose: " + text));
        });
        rowEl.appendChild(ul);
      }

      if (s.q.misconception) {
        const m = el("div", "misconception");
        m.appendChild(el("strong", null, "Misconception note: "));
        m.appendChild(document.createTextNode(s.q.misconception));
        rowEl.appendChild(m);
      }

      dash.appendChild(rowEl);
    });

    // ---------- secondary: completion per class ----------
    dash.appendChild(el("h2", null, "Completions per class"));
    const byClass = {};
    data.forEach((r) => { byClass[r.classCode] = (byClass[r.classCode] || 0) + 1; });
    const table = el("table", "plain");
    const thr = el("tr");
    thr.append(el("th", null, "Class"), el("th", null, "Submitted"));
    table.appendChild(thr);
    Object.entries(byClass).sort().forEach(([c, n]) => {
      const tr = el("tr");
      tr.append(el("td", null, c), el("td", null, String(n)));
      table.appendChild(tr);
    });
    dash.appendChild(table);

    // ---------- secondary: score distribution ----------
    dash.appendChild(el("h2", null, "Score distribution"));
    const totalQ = quiz.questions.length;
    const buckets = Array(totalQ + 1).fill(0);
    data.forEach((r) => {
      const s = Math.max(0, Math.min(totalQ, Number(r.score) || 0));
      buckets[s] += 1;
    });
    const maxCount = Math.max(1, ...buckets);
    const histo = el("div", "histo");
    buckets.forEach((count, scoreVal) => {
      const rowH = el("div", "histo-row");
      rowH.appendChild(el("span", null, scoreVal + "/" + totalQ));
      const track = el("div", "bar-track");
      const fill = el("div", "bar-fill");
      fill.style.width = (count / maxCount) * 100 + "%";
      track.appendChild(fill);
      rowH.appendChild(track);
      rowH.appendChild(el("span", "muted", String(count)));
      histo.appendChild(rowH);
    });
    dash.appendChild(histo);
  }

  // ---------- CSV export (no student labels: they never reach this page) ----------
  function exportCsv() {
    const data = filteredRows();
    const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const lines = [
      ["timestamp", "quizId", "classCode", "attemptNumber", "score", "total", "durationSeconds", "responsesJson"].join(","),
    ];
    data.forEach((r) => {
      lines.push([
        esc(r.timestamp), esc(r.quizId), esc(r.classCode), esc(r.attemptNumber),
        esc(r.score), esc(r.total), esc(r.durationSeconds), esc(JSON.stringify(r.responses)),
      ].join(","));
    });
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = state.quizId + (state.classCode ? "-" + state.classCode : "") + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  boot();
})();
