# Classroom Quiz Site

A small static site for formative multichoice quizzes. Students get
per-option feedback — why their wrong answer was wrong *and* why the
right answer is right. You get a dashboard showing which questions the
class most commonly missed. Nothing here is suitable for grading, and
that is by design (see "Known limitations").

There is **no build step**. The site is plain HTML, CSS and JavaScript.
Hosting it means uploading this folder somewhere that serves static
files (GitHub Pages or Netlify free tier both work).

---

## 1. How to add a new quiz (no coding needed)

This takes about ten minutes once you have your questions written.

1. Open the `quizzes/` folder.
2. **Copy** `_template.json` and rename the copy, e.g.
   `y11-ionic-bonding.json`. Use lowercase letters, numbers and
   hyphens only.
3. Open your new file in any text editor and fill it in. The template
   has a comment above every field explaining what it does (comments
   are the lines whose names start with `_` — you can delete them or
   leave them, the app ignores them). The important rules:
   - `quizId` must match the filename idea, e.g. `y11-ionic-bonding`.
   - Every question needs a unique `id` (`q1`, `q2`, …).
   - **Exactly one** option per question has `"correct": true`.
   - **Every option needs a `why`** — this is the whole point of the
     app. Write it like you'd explain it to the student at your desk.
   - `misconception` is optional and only ever shown to you, on the
     dashboard.
4. Open `quizzes/index.json`. Copy one of the existing entries
   (everything between `{` and `}` including both braces, plus a comma
   between entries) and edit it:

   ```json
   {
     "quizId": "y11-ionic-bonding",
     "title": "Ionic Bonding",
     "subtitle": "After-lab quiz",
     "yearLevel": "Year 11",
     "file": "y11-ionic-bonding.json",
     "published": false
   }
   ```

5. Upload / commit the two changed files to wherever the site is
   hosted. No other file changes. Nothing to rebuild.
6. **Test it yourself first.** While `"published": false`, the quiz is
   hidden from the student list but you can open it directly at
   `quiz.html?quiz=y11-ionic-bonding`. When you're happy, change
   `published` to `true` and re-upload `index.json`.
7. Post the link in Google Classroom:
   `https://your-site/quiz.html?quiz=y11-ionic-bonding`

**If you make a typo** (e.g. `"correct": ture`, or a missing `why`),
the quiz refuses to load and shows a message naming the file and the
exact problem. It will never show students a half-broken quiz. A free
JSON checker like jsonlint.com is handy if the message says the file
"is not valid JSON" (that usually means a missing comma or quote mark).

---

## 2. Deploying the backend (one-time, ~15 minutes)

The backend is a Google Apps Script attached to a Google Sheet in your
school account. Submissions appear as rows in the Sheet; you can pivot
or chart them there whenever you like, with or without this site.

> **Check this first:** the deployment below needs "Who has access:
> **Anyone**". Some school Google Workspace domains block that setting.
> If yours does, this architecture won't work and you should stop here
> and talk to your IT admin — everything else about the site still
> works, but results won't save.

1. Go to [sheets.new](https://sheets.new) **while signed in to your
   school Google account**. Name the sheet, e.g. "Quiz submissions".
2. In the menu: **Extensions → Apps Script**.
3. Delete the sample code in the editor and paste in the entire
   contents of `apps-script/Code.gs` from this folder.
4. At the top of the code, change these two lines:
   - `SHARED_SECRET` — invent any string, e.g. `kereru-flax-42`.
   - `DASHBOARD_KEY` — invent a *different* string. This is the key
     you (and only teaching staff) will type into the dashboard.
5. Click **Deploy → New deployment**. Choose type **Web app**. Set:
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
6. Authorise when prompted, then copy the Web app **URL** (it ends
   in `/exec`).
7. Open `js/config.js` in this folder and paste:
   - the URL into `APPS_SCRIPT_URL`
   - the exact same `SHARED_SECRET` string you used in step 4
8. Upload the changed `config.js` to your site host. Done.

**If you later edit Code.gs**, you must click Deploy → **Manage
deployments** → edit → new version, or the change won't go live.

## 3. Hosting the site

- **GitHub Pages:** put this folder in a repository, then Settings →
  Pages → deploy from branch. Done.
- **Netlify:** drag the folder onto the Netlify dashboard. Done.

There is no build command. If a host asks for one, leave it blank and
set the publish directory to the folder root.

---

## 4. The dashboard and its key

The dashboard is at `teacher.html`. It asks for the **dashboard key**
— the `DASHBOARD_KEY` string you set in Code.gs step 4. The key is
checked on Google's servers, is never present in the site's code, and
is remembered only until you close the browser tab (per-session).

The dashboard shows: questions sorted by % wrong (hardest first, with
which wrong option was most chosen, and your misconception notes),
completion counts per class, a score histogram, and a CSV export.
It deliberately has **no per-student view**, and student name labels
are never sent to it at all — they exist only in the Sheet itself.

---

## 5. Known limitations — read these, they're deliberate

**The answer key is visible to a determined student.** Quiz files,
including which option is correct and all the feedback, are downloaded
by the browser. Anyone who opens developer tools can read them. This
is fine for a self-check tool and is exactly why this site must
**never be used for marks or assessment** of any kind.

**The shared secret is not security.** It's included in the site's
own JavaScript, so anyone who reads the page source can find it. Its
only job is to stop random internet noise and casual mischief from
writing junk rows to your Sheet. Assume a motivated Year 11 can post
fake rows; the "First attempts only" view and your own judgement are
the real filters.

**Attempt counting is per-device.** "First attempt" is tracked in each
device's browser storage. A student who does the quiz on their phone
and again on a Chromebook shows up as two first attempts; a student
who clears their browser data resets to attempt 1. For a formative
snapshot of a whole class this doesn't matter much, but be aware of it
when the numbers look slightly off.

**Apps Script can't send real "403 Forbidden" responses.** A rejected
request (wrong secret, wrong dashboard key) gets an OK-looking
response whose content says `{"ok":false,"error":"forbidden"}` — and
no data is written or returned. Same effect, different plumbing;
mentioned here so nobody is surprised when testing with curl.

**No accounts, no names.** Only a class code and a "first name + last
initial" label (max 20 characters) are ever collected, per the NZ
Privacy Act considerations in the project spec. Keep it that way — in
particular, resist the temptation to add a surname field or a
per-student dashboard view later.

---

## 6. File map

```
index.html                     student quiz list (filter by year)
quiz.html                      the quiz itself (?quiz=<quizId>)
teacher.html                   dashboard (key required)
css/styles.css                 all styling, including print styles
js/config.js                   ← the only file you edit after setup
js/validate.js                 quiz file checking (fails loudly)
js/app.js                      student flow
js/teacher.js                  dashboard logic
quizzes/index.json             the quiz manifest
quizzes/_template.json         copy me to make a new quiz
quizzes/y9-separating-mixtures.json   working sample quiz
apps-script/Code.gs            paste into Google Apps Script
```
