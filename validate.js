/* Quiz validation.
   Runs every time a quiz file is loaded. Returns a list of
   human-readable error strings; an empty list means the quiz
   is safe to render. Keys beginning with "_" (used for comments
   in _template.json) are ignored everywhere.
*/

function validateQuiz(quiz, expectedQuizId, fileName) {
  const errors = [];
  const where = (msg) => `${fileName}: ${msg}`;

  if (!quiz || typeof quiz !== "object") {
    return [where("file is not a JSON object.")];
  }

  if (typeof quiz.quizId !== "string" || quiz.quizId.trim() === "") {
    errors.push(where('missing "quizId".'));
  } else if (expectedQuizId && quiz.quizId !== expectedQuizId) {
    errors.push(
      where(
        `"quizId" is "${quiz.quizId}" but index.json says "${expectedQuizId}". They must match exactly.`
      )
    );
  }

  if (typeof quiz.title !== "string" || quiz.title.trim() === "") {
    errors.push(where('missing "title".'));
  }

  if (!Array.isArray(quiz.classCodes) || quiz.classCodes.length === 0) {
    errors.push(where('"classCodes" must be a list with at least one class code.'));
  }

  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    errors.push(where('"questions" must be a list with at least one question.'));
    return errors; // nothing more to check
  }

  const seenQuestionIds = new Set();

  quiz.questions.forEach((q, qi) => {
    const qLabel = q && q.id ? `question "${q.id}"` : `question ${qi + 1}`;

    if (!q || typeof q !== "object") {
      errors.push(where(`${qLabel} is not an object.`));
      return;
    }
    if (typeof q.id !== "string" || q.id.trim() === "") {
      errors.push(where(`question ${qi + 1} is missing an "id".`));
    } else if (seenQuestionIds.has(q.id)) {
      errors.push(where(`duplicate question id "${q.id}". Question ids must be unique.`));
    } else {
      seenQuestionIds.add(q.id);
    }

    if (typeof q.stem !== "string" || q.stem.trim() === "") {
      errors.push(where(`${qLabel} is missing its "stem" (the question text).`));
    }

    if (!Array.isArray(q.options)) {
      errors.push(where(`${qLabel} has no "options" list.`));
      return;
    }
    if (q.options.length < 2 || q.options.length > 6) {
      errors.push(
        where(`${qLabel} has ${q.options.length} options. Each question needs between 2 and 6.`)
      );
    }

    const seenOptionIds = new Set();
    let correctCount = 0;

    q.options.forEach((opt, oi) => {
      const oLabel = opt && opt.id ? `option "${opt.id}"` : `option ${oi + 1}`;
      if (!opt || typeof opt !== "object") {
        errors.push(where(`${qLabel}, ${oLabel} is not an object.`));
        return;
      }
      if (typeof opt.id !== "string" || opt.id.trim() === "") {
        errors.push(where(`${qLabel}, option ${oi + 1} is missing an "id".`));
      } else if (seenOptionIds.has(opt.id)) {
        errors.push(where(`${qLabel} has two options with id "${opt.id}".`));
      } else {
        seenOptionIds.add(opt.id);
      }
      if (typeof opt.text !== "string" || opt.text.trim() === "") {
        errors.push(where(`${qLabel}, ${oLabel} is missing its "text".`));
      }
      if (opt.correct === true) correctCount += 1;
      else if (opt.correct !== false) {
        errors.push(
          where(`${qLabel}, ${oLabel}: "correct" must be exactly true or false (check for typos like "ture").`)
        );
      }
      if (typeof opt.why !== "string" || opt.why.trim() === "") {
        errors.push(
          where(`${qLabel}, ${oLabel} is missing its "why". Every option must explain why it is right or wrong.`)
        );
      }
    });

    if (correctCount !== 1) {
      errors.push(
        where(`${qLabel} has ${correctCount} options marked "correct": true. There must be exactly one.`)
      );
    }
  });

  return errors;
}

/* Validate the manifest itself. */
function validateIndex(indexData) {
  const errors = [];
  if (!indexData || !Array.isArray(indexData.quizzes)) {
    return ['index.json: must contain a "quizzes" list.'];
  }
  const seen = new Set();
  indexData.quizzes.forEach((entry, i) => {
    const label = entry && entry.quizId ? `entry "${entry.quizId}"` : `entry ${i + 1}`;
    ["quizId", "title", "file"].forEach((field) => {
      if (typeof entry[field] !== "string" || entry[field].trim() === "") {
        errors.push(`index.json: ${label} is missing "${field}".`);
      }
    });
    if (entry.quizId) {
      if (seen.has(entry.quizId)) errors.push(`index.json: duplicate quizId "${entry.quizId}".`);
      seen.add(entry.quizId);
    }
  });
  return errors;
}

/* Node export for offline testing; ignored in the browser. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { validateQuiz, validateIndex };
}
