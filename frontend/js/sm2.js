/**
 * SM-2 Spaced Repetition Algorithm
 * Pure client-side implementation for preview/validation.
 * The authoritative calculation runs on the server.
 *
 * Quality scores:
 *   5 — Perfect response
 *   4 — Correct after hesitation
 *   3 — Correct with serious difficulty
 *   2 — Incorrect, but easy recall when shown answer
 *   1 — Incorrect, remembered after seeing answer
 *   0 — Complete blackout
 */

function sm2(card, quality) {
  let { easiness_factor, interval, repetitions } = card;
  const q = Math.round(Math.max(0, Math.min(5, quality)));

  if (q >= 3) {
    // Successful recall
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easiness_factor);
    }
    repetitions += 1;
  } else {
    // Failed recall — reset
    repetitions = 0;
    interval = 1;
  }

  // Update easiness factor
  easiness_factor += 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  easiness_factor = Math.max(1.3, easiness_factor);

  // Next review date
  const next_review_date = new Date();
  next_review_date.setDate(next_review_date.getDate() + interval);

  return {
    easiness_factor: Math.round(easiness_factor * 100) / 100,
    interval,
    repetitions,
    next_review_date,
  };
}
