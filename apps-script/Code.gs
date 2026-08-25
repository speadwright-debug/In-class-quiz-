/* ============================================================
   Quiz backend — Google Apps Script Web App.

   SETUP (details in README.md):
   1. Create a new Google Sheet. Extensions → Apps Script.
   2. Replace the default code with this file.
   3. Change the two values below.
   4. Deploy → New deployment → Web app.
        Execute as: Me
        Who has access: Anyone
   5. Copy the /exec URL into js/config.js on the site.

   SECURITY NOTES — read before trusting this:
   - SHARED_SECRET must match js/config.js. It is visible to
     anyone who reads the site's source code, so it prevents
     casual/accidental posting only. It is not real security.
   - DASHBOARD_KEY lives ONLY here (never in the site's files).
     It is checked on Google's servers, so students cannot find
     it in the page source. Give it only to teaching staff.
   - Apps Script cannot return real HTTP status codes like 403;
     rejected requests get a 200 response whose body is
     {"ok":false,"error":"forbidden"} and NO row is written.
   ============================================================ */

var SHARED_SECRET = "change-me-to-match-config-js";
var DASHBOARD_KEY = "change-me-teacher-key";
var SHEET_NAME = "Submissions";

var HEADERS = [
  "timestamp", "quizId", "classCode", "studentLabel", "attemptNumber",
  "score", "total", "durationSeconds", "responsesJson"
];

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- POST: one row per submission ---------- */
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "bad-json" });
  }

  if (!body || body.secret !== SHARED_SECRET) {
    return json_({ ok: false, error: "forbidden" });
  }

  var started = new Date(body.startedAt);
  var submitted = new Date(body.submittedAt);
  var duration = Math.round((submitted.getTime() - started.getTime()) / 1000);
  if (!isFinite(duration) || duration < 0) duration = "";

  // Server-side re-enforcement of the privacy constraint: the label
  // is truncated to 20 chars no matter what the client sent.
  var label = String(body.studentLabel || "").slice(0, 20);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000); // two phones submitting at once must not collide
  try {
    getSheet_().appendRow([
      new Date(),
      String(body.quizId || ""),
      String(body.classCode || ""),
      label,
      Number(body.attemptNumber) || 1,
      Number(body.score),
      Number(body.total),
      duration,
      JSON.stringify(body.responses || [])
    ]);
  } finally {
    lock.releaseLock();
  }

  return json_({ ok: true });
}

/* ---------- GET: dashboard data, gated by DASHBOARD_KEY ---------- */
function doGet(e) {
  var p = (e && e.parameter) || {};

  if (p.action === "ping") {
    return json_({ ok: true });
  }

  if (p.action !== "data") {
    return json_({ ok: false, error: "unknown-action" });
  }
  if (p.key !== DASHBOARD_KEY) {
    return json_({ ok: false, error: "forbidden" });
  }

  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var responses = [];
    try { responses = JSON.parse(r[8]); } catch (err) { responses = []; }
    rows.push({
      timestamp: r[0],
      quizId: String(r[1]),
      classCode: String(r[2]),
      // studentLabel (column r[3]) is DELIBERATELY not returned.
      // The dashboard has no per-student view and never needs it;
      // labels stay in the Sheet only.
      attemptNumber: Number(r[4]) || 1,
      score: Number(r[5]),
      total: Number(r[6]),
      durationSeconds: r[7] === "" ? null : Number(r[7]),
      responses: responses
    });
  }
  return json_({ ok: true, rows: rows });
}
