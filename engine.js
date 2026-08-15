/*!
 * Recallo engine — memory-scheduling and study-workload math.
 * Pure functions. No DOM, no network. Works in browser (window.RC) and Node (module.exports).
 *
 * Algorithm sources (all public / open source):
 *  - FSRS-5 (Free Spaced Repetition Scheduler), open-source, Apache-2.0.
 *    Forgetting curve:  R(t,S) = (1 + FACTOR * t/S) ^ DECAY,  DECAY = -0.5, FACTOR = 19/81
 *    Interval:          I(r,S) = (S/FACTOR) * (r ^ (1/DECAY) - 1)
 *    Ref: open-spaced-repetition/rs-fsrs src/parameters.rs; FSRS-5 default weights as published
 *         in the Anki forum thread "FSRS intervals in Python not matching up with visualizer".
 *  - SM-2 (SuperMemo 2, Woźniak 1987), published algorithm description.
 *    EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02)), floor 1.3; I1=1, I2=6, In = In-1 * EF.
 *  - Anki convention: a card is "mature" when its interval is >= 21 days.
 *
 * Nothing here is fitted to private data: default FSRS weights are the published defaults.
 * Simulations are deterministic (seeded PRNG) so the same inputs always give the same output.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RC = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  /* ------------------------------------------------------------------ utils */
  var clamp = function (x, lo, hi) { return Math.min(Math.max(x, lo), hi); };
  var round2 = function (x) { return Math.round(x * 100) / 100; };
  var isNum = function (x) { return typeof x === 'number' && isFinite(x); };

  function req(x, name) {
    if (!isNum(x)) throw new Error('Recallo: ' + name + ' must be a finite number');
    return x;
  }

  // mulberry32 — small, fast, deterministic PRNG (public domain algorithm)
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ FSRS-5 */
  var DECAY = -0.5;
  var FACTOR = 19 / 81;              // = 0.9^(1/DECAY) - 1
  var S_MIN = 0.01;
  var MAX_INTERVAL = 36500;

  // FSRS-5 published default weights (19)
  var W5 = [
    0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
    2.9898, 0.51655, 0.6621
  ];

  // Grades: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
  var GRADES = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

  /** Retrievability: probability of recall after `t` days with stability `S` (days). */
  function retrievability(t, S) {
    req(t, 't'); req(S, 'S');
    if (S <= 0) return 0;
    if (t < 0) t = 0;
    return Math.pow(1 + FACTOR * t / S, DECAY);
  }

  /** Days until retrievability decays to `r` (0<r<1). Unrounded. */
  function intervalExact(r, S) {
    req(r, 'r'); req(S, 'S');
    if (r <= 0 || r >= 1) throw new Error('Recallo: desired retention must be in (0,1)');
    return (S / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
  }

  /** Scheduler interval in whole days (FSRS rounds, min 1, capped). */
  function nextInterval(r, S, maxInterval) {
    var raw = intervalExact(r, S);
    var cap = isNum(maxInterval) ? maxInterval : MAX_INTERVAL;
    return clamp(Math.round(raw), 1, cap);
  }

  /** Stability that yields interval `t` days at target retention `r` (inverse of intervalExact). */
  function stabilityForInterval(t, r) {
    return t * FACTOR / (Math.pow(r, 1 / DECAY) - 1);
  }

  function initStability(grade, w) {
    w = w || W5;
    return Math.max(w[clamp(grade, 1, 4) - 1], S_MIN);
  }

  function initDifficulty(grade, w) {
    w = w || W5;
    return clamp(w[4] - Math.exp(w[5] * (grade - 1)) + 1, 1, 10);
  }

  function nextDifficulty(D, grade, w) {
    w = w || W5;
    var deltaD = -w[6] * (grade - 3);
    var dPrime = D + deltaD * ((10 - D) / 9);            // linear damping
    var dTarget = initDifficulty(GRADES.EASY, w);        // mean reversion target = D0(Easy)
    return clamp(w[7] * dTarget + (1 - w[7]) * dPrime, 1, 10);
  }

  function stabilityIncrease(D, S, R, grade, w) {
    w = w || W5;
    var hardPenalty = grade === GRADES.HARD ? w[15] : 1;
    var easyBonus = grade === GRADES.EASY ? w[16] : 1;
    return 1 + hardPenalty * easyBonus * Math.exp(w[8]) * (11 - D) *
      Math.pow(S, -w[9]) * (Math.exp(w[10] * (1 - R)) - 1);
  }

  function nextStabilityRecall(D, S, R, grade, w) {
    return S * stabilityIncrease(D, S, R, grade, w);
  }

  function nextStabilityForget(D, S, R, w) {
    w = w || W5;
    return w[11] * Math.pow(D, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R));
  }

  /** Post-review stability. Lapses never increase stability (FSRS clamps to previous S). */
  function nextStability(S, D, R, grade, w) {
    if (grade === GRADES.AGAIN) {
      return Math.max(Math.min(nextStabilityForget(D, S, R, w), S), S_MIN);
    }
    return Math.max(nextStabilityRecall(D, S, R, grade, w), S_MIN);
  }

  /** Same-day (short-term) stability update, FSRS-5. */
  function sameDayStability(S, grade, w) {
    w = w || W5;
    return Math.max(S * Math.exp(w[17] * (grade - 3 + w[18])), S_MIN);
  }

  /**
   * Walk a rating path through FSRS-5 and return the schedule.
   * @param {number[]} grades  e.g. [3,3,3,3] (Good x4). First entry = first study.
   * @param {object} opt {desiredRetention=0.9, w, maxInterval}
   * @returns {{rows:Array, totalDays:number, desiredRetention:number}}
   */
  function fsrsSchedule(grades, opt) {
    opt = opt || {};
    var r = opt.desiredRetention || 0.9;
    var w = opt.w || W5;
    if (!Array.isArray(grades) || !grades.length) throw new Error('Recallo: grades required');
    var rows = [], S = null, D = null, day = 0;
    for (var i = 0; i < grades.length; i++) {
      var g = clamp(Math.round(grades[i]), 1, 4);
      var Rat = 1; // retrievability seen by the scheduler at this review
      if (S === null) {
        S = initStability(g, w);
        D = initDifficulty(g, w);
      } else {
        var elapsed = rows[rows.length - 1].interval;
        Rat = retrievability(elapsed, S);
        var newD = nextDifficulty(D, g, w);
        S = nextStability(S, newD, Rat, g, w);
        D = newD;
      }
      var iv = nextInterval(r, S, opt.maxInterval);
      day += iv;
      rows.push({
        review: i + 1, grade: g, stability: S, difficulty: D,
        retrievabilityAtReview: Rat, interval: iv, dueOnDay: day,
        mature: iv >= 21
      });
    }
    return { rows: rows, totalDays: day, desiredRetention: r };
  }

  /** Interval chain for an all-Good path, until horizon days are covered. */
  function chainIntervals(opt) {
    opt = opt || {};
    var horizon = opt.horizonDays || 365;
    var r = opt.desiredRetention || 0.9;
    var w = opt.w || W5;
    var grade = opt.grade || GRADES.GOOD;
    var S = initStability(grade, w), D = initDifficulty(grade, w);
    var day = 0, out = [], guard = 0;
    while (day < horizon && guard++ < 1000) {
      var iv = nextInterval(r, S, opt.maxInterval);
      out.push({ interval: iv, dueOnDay: day + iv, stability: S, difficulty: D });
      var R = retrievability(iv, S);
      var nd = nextDifficulty(D, grade, w);
      S = nextStability(S, nd, R, grade, w);
      D = nd;
      day += iv;
    }
    return {
      intervals: out,
      // reviews (not counting the first study) that actually fall inside the horizon
      reviewsDueWithinHorizon: out.filter(function (x) { return x.dueOnDay <= horizon; }).length,
      totalStudyEvents: out.filter(function (x) { return x.dueOnDay <= horizon; }).length + 1,
      horizonDays: horizon
    };
  }

  /* ------------------------------------------------------------------ SM-2 */
  /**
   * One SM-2 step. q in 0..5 (>=3 = correct).
   * @returns {{interval, ef, reps, lapsed}}
   */
  function sm2Step(state, q) {
    var ef = isNum(state && state.ef) ? state.ef : 2.5;
    var reps = isNum(state && state.reps) ? state.reps : 0;
    var interval = isNum(state && state.interval) ? state.interval : 0;
    q = clamp(Math.round(q), 0, 5);

    // Ease factor update (applies on every graded repetition, per SM-2 description)
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ef < 1.3) ef = 1.3;

    if (q < 3) {                       // failed: repetitions restart, EF is kept
      return { interval: 1, ef: ef, reps: 0, lapsed: true };
    }
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ef);
    return { interval: interval, ef: ef, reps: reps, lapsed: false };
  }

  /** Run a full SM-2 rating path. */
  function sm2Schedule(qualities, startEf) {
    var st = { interval: 0, ef: isNum(startEf) ? startEf : 2.5, reps: 0 };
    var day = 0, rows = [];
    for (var i = 0; i < qualities.length; i++) {
      st = sm2Step(st, qualities[i]);
      day += st.interval;
      rows.push({
        review: i + 1, quality: clamp(Math.round(qualities[i]), 0, 5),
        interval: st.interval, ef: round2(st.ef), reps: st.reps,
        lapsed: st.lapsed, dueOnDay: day
      });
    }
    return { rows: rows, totalDays: day, finalEf: round2(st.ef) };
  }

  /* --------------------------------------------------- workload simulation */
  /**
   * Deterministic day-by-day deck simulation with FSRS-5 scheduling.
   * Every card is a real object with its own S/D/due; outcomes are drawn from the
   * model's own recall probability using a seeded PRNG, so runs are reproducible.
   *
   * @param {object} o
   *   newPerDay      new cards introduced per study day (default 20)
   *   days           horizon in days (default 365)
   *   deckSize       stop introducing new cards after this many (default Infinity)
   *   desiredRetention target recall probability used to schedule (default 0.9)
   *   secPerNew      seconds spent on a new card (default 30)
   *   secPerReview   seconds spent on a review (default 12)
   *   hardShare/easyShare  share of *successful* reviews graded Hard / Easy (default .10/.10)
   *   assumeAllCorrect  if true, never lapse (useful for analytic cross-checks)
   *   seed           PRNG seed (default 42)
   * @returns per-day series + steady-state summary
   */
  function simulateWorkload(o) {
    o = o || {};
    var newPerDay = Math.max(0, Math.round(o.newPerDay != null ? o.newPerDay : 20));
    var days = clamp(Math.round(o.days || 365), 1, 3650);
    var deckSize = isNum(o.deckSize) ? o.deckSize : Infinity;
    var r = clamp(o.desiredRetention || 0.9, 0.5, 0.99);
    var secNew = isNum(o.secPerNew) ? o.secPerNew : 30;
    var secRev = isNum(o.secPerReview) ? o.secPerReview : 12;
    var hardShare = clamp(isNum(o.hardShare) ? o.hardShare : 0.10, 0, 1);
    var easyShare = clamp(isNum(o.easyShare) ? o.easyShare : 0.10, 0, 1 - hardShare);
    var w = o.w || W5;
    var rand = rng(o.seed || 42);
    var allCorrect = !!o.assumeAllCorrect;

    var cards = [];          // {S, D, due, last, reviews, lapses}
    var series = [];
    var introduced = 0, totalReviews = 0, totalLapses = 0, totalNew = 0;

    // bucket due-dates for O(1) lookup
    var dueMap = {};
    function schedule(card, day) {
      var iv = nextInterval(r, card.S, o.maxInterval);
      card.due = day + iv;
      card.interval = iv;
      (dueMap[card.due] = dueMap[card.due] || []).push(card);
    }

    for (var day = 1; day <= days; day++) {
      var nNew = 0, nRev = 0, nLapse = 0;

      // 1) reviews scheduled for today
      var todo = dueMap[day] || [];
      for (var i = 0; i < todo.length; i++) {
        var c = todo[i];
        var elapsed = day - c.last;
        var R = retrievability(elapsed, c.S);
        var success = allCorrect ? true : (rand() < R);
        var g;
        if (!success) g = GRADES.AGAIN;
        else {
          var u = rand();
          g = u < hardShare ? GRADES.HARD : (u < hardShare + easyShare ? GRADES.EASY : GRADES.GOOD);
        }
        var nd = nextDifficulty(c.D, g, w);
        c.S = nextStability(c.S, nd, R, g, w);
        c.D = nd;
        c.last = day;
        c.reviews++;
        nRev++; totalReviews++;
        if (!success) { c.lapses++; nLapse++; totalLapses++; }
        schedule(c, day);
      }
      delete dueMap[day];

      // 2) new cards
      for (var k = 0; k < newPerDay && introduced < deckSize; k++) {
        var card = {
          S: initStability(GRADES.GOOD, w), D: initDifficulty(GRADES.GOOD, w),
          last: day, reviews: 0, lapses: 0, interval: 0, due: 0
        };
        schedule(card, day);
        cards.push(card);
        introduced++; nNew++; totalNew++;
      }

      series.push({
        day: day, newCards: nNew, reviews: nRev, lapses: nLapse,
        minutes: round2((nNew * secNew + nRev * secRev) / 60),
        deck: introduced
      });
    }

    // steady state = mean over the final 30 days (or final 10% if horizon is short)
    var tailLen = Math.max(1, Math.min(30, Math.round(days * 0.1) || 1));
    if (days >= 60) tailLen = 30;
    var tail = series.slice(-tailLen);
    var sum = function (arr, key) { return arr.reduce(function (a, x) { return a + x[key]; }, 0); };

    // knowledge state at horizon end
    var expectedRecall = 0, mature = 0;
    for (var j = 0; j < cards.length; j++) {
      var cc = cards[j];
      expectedRecall += retrievability(days - cc.last, cc.S);
      if (cc.interval >= 21) mature++;
    }

    var minutesPerDay = round2(sum(tail, 'minutes') / tail.length);
    return {
      series: series,
      steady: {
        windowDays: tail.length,
        reviewsPerDay: round2(sum(tail, 'reviews') / tail.length),
        newPerDay: round2(sum(tail, 'newCards') / tail.length),
        minutesPerDay: minutesPerDay,
        lapsesPerDay: round2(sum(tail, 'lapses') / tail.length)
      },
      totals: {
        deckSize: introduced,
        reviews: totalReviews,
        newCards: totalNew,
        lapses: totalLapses,
        lapseRate: totalReviews ? round2(totalLapses / totalReviews) : 0,
        hours: round2((totalNew * secNew + totalReviews * secRev) / 3600),
        reviewsPerCard: introduced ? round2(totalReviews / introduced) : 0
      },
      knowledge: {
        expectedRecallable: Math.round(expectedRecall),
        expectedRecallableShare: introduced ? round2(expectedRecall / introduced) : 0,
        matureCards: mature
      },
      peakMinutes: round2(series.reduce(function (a, x) { return Math.max(a, x.minutes); }, 0)),
      inputs: { newPerDay: newPerDay, days: days, desiredRetention: r, secPerNew: secNew, secPerReview: secRev }
    };
  }

  /**
   * Sweep target retention and report the cost/benefit of each setting.
   * "recalledPerMinute" = expected recallable cards at the horizon per daily study minute.
   */
  function retentionSweep(o) {
    o = o || {};
    var list = o.retentions || [0.70, 0.75, 0.80, 0.85, 0.90, 0.93, 0.95, 0.97];
    var rows = list.map(function (r) {
      var sim = simulateWorkload(Object.assign({}, o, { desiredRetention: r }));
      var mins = sim.steady.minutesPerDay;
      return {
        desiredRetention: r,
        reviewsPerDay: sim.steady.reviewsPerDay,
        minutesPerDay: mins,
        totalReviews: sim.totals.reviews,
        reviewsPerCard: sim.totals.reviewsPerCard,
        lapseRate: sim.totals.lapseRate,
        expectedRecallable: sim.knowledge.expectedRecallable,
        recalledPerMinute: mins > 0 ? round2(sim.knowledge.expectedRecallable / mins) : 0
      };
    });
    var best = rows.reduce(function (a, x) { return x.recalledPerMinute > a.recalledPerMinute ? x : a; }, rows[0]);
    return { rows: rows, best: best };
  }

  /**
   * Exam plan: can `items` be learned by the exam date inside a daily time budget?
   * Searches the largest sustainable new/day, then reports the resulting load + model retention.
   */
  function examPlan(o) {
    o = o || {};
    var items = Math.max(1, Math.round(o.items || 500));
    var days = Math.max(1, Math.round(o.daysUntilExam || 60));
    var budget = Math.max(1, o.minutesPerDay || 30);
    var base = {
      days: days, deckSize: items, desiredRetention: o.desiredRetention || 0.9,
      secPerNew: o.secPerNew, secPerReview: o.secPerReview, seed: o.seed || 42,
      hardShare: o.hardShare, easyShare: o.easyShare
    };
    var required = Math.ceil(items / days);
    var run = function (npd) { return simulateWorkload(Object.assign({}, base, { newPerDay: npd })); };

    var atRequired = run(required);
    var meanMinutes = round2(atRequired.series.reduce(function (a, x) { return a + x.minutes; }, 0) / days);

    // largest new/day whose *mean* daily minutes fit the budget
    var lo = 1, hi = Math.max(1, required * 3), fit = 0, fitSim = null;
    for (var g = 0; g < 14 && lo <= hi; g++) {
      var mid = Math.floor((lo + hi) / 2);
      var s = run(mid);
      var mm = s.series.reduce(function (a, x) { return a + x.minutes; }, 0) / days;
      if (mm <= budget) { fit = mid; fitSim = s; lo = mid + 1; } else { hi = mid - 1; }
    }
    var coverage = fit ? Math.min(items, fit * days) : 0;
    return {
      items: items, daysUntilExam: days, minutesPerDay: budget,
      requiredNewPerDay: required,
      meanMinutesAtRequired: meanMinutes,
      peakMinutesAtRequired: atRequired.peakMinutes,
      feasible: meanMinutes <= budget,
      sustainableNewPerDay: fit,
      itemsCoveredWithinBudget: coverage,
      shortfall: Math.max(0, items - coverage),
      expectedRecallableAtExam: atRequired.knowledge.expectedRecallable,
      expectedRecallShare: atRequired.knowledge.expectedRecallableShare,
      reviewsPerDayAtExamWeek: atRequired.steady.reviewsPerDay,
      series: atRequired.series,
      sustainableSeries: fitSim ? fitSim.series : null
    };
  }

  /**
   * Same number of repetitions, different spacing.
   * Massed = all repetitions in one session (FSRS same-day stability update).
   * Spaced = repetitions spread evenly over the available days (real elapsed times).
   * Reports model retention on exam day and 30 days later.
   */
  function cramVsSpaced(o) {
    o = o || {};
    var reps = clamp(Math.round(o.repetitions || 4), 1, 40);
    var daysUntilExam = clamp(Math.round(o.daysUntilExam || 14), 1, 3650);
    var later = clamp(Math.round(o.laterDays != null ? o.laterDays : 30), 0, 3650);
    var w = o.w || W5;
    var grade = GRADES.GOOD;

    // -- massed: day 0, all reps back to back
    var Sm = initStability(grade, w), Dm = initDifficulty(grade, w);
    for (var i = 1; i < reps; i++) Sm = sameDayStability(Sm, grade, w);
    var massed = {
      sessions: 1, stability: Sm,
      retentionAtExam: retrievability(daysUntilExam, Sm),
      retentionLater: retrievability(daysUntilExam + later, Sm)
    };

    // -- spaced: reps spread across the window (first today, last on exam eve at the latest)
    var gap = daysUntilExam / reps;
    var Ss = initStability(grade, w), Ds = initDifficulty(grade, w), last = 0, sched = [0];
    for (var k = 1; k < reps; k++) {
      var d = Math.min(daysUntilExam, Math.round(k * gap));
      var elapsed = Math.max(0, d - last);
      var R = elapsed > 0 ? retrievability(elapsed, Ss) : 1;
      var nd = nextDifficulty(Ds, grade, w);
      Ss = elapsed > 0 ? nextStability(Ss, nd, R, grade, w) : sameDayStability(Ss, grade, w);
      Ds = nd; last = d; sched.push(d);
    }
    var spaced = {
      sessions: reps, stability: Ss, schedule: sched,
      retentionAtExam: retrievability(Math.max(0, daysUntilExam - last), Ss),
      retentionLater: retrievability(Math.max(0, daysUntilExam - last) + later, Ss)
    };

    return {
      repetitions: reps, daysUntilExam: daysUntilExam, laterDays: later,
      massed: massed, spaced: spaced,
      examAdvantage: round2((spaced.retentionAtExam - massed.retentionAtExam) * 100),
      laterAdvantage: round2((spaced.retentionLater - massed.retentionLater) * 100)
    };
  }

  /* ------------------------------------------------------------------ reading */
  function readingSpeed(words, seconds) {
    req(words, 'words'); req(seconds, 'seconds');
    if (seconds <= 0) throw new Error('Recallo: seconds must be > 0');
    return round2(words / (seconds / 60));
  }

  function readingTime(words, wpm) {
    req(words, 'words'); req(wpm, 'wpm');
    if (wpm <= 0) throw new Error('Recallo: wpm must be > 0');
    var minutes = words / wpm;
    return {
      minutes: round2(minutes),
      hours: round2(minutes / 60),
      hhmm: fmtHM(minutes)
    };
  }

  function fmtHM(minutes) {
    var m = Math.max(0, Math.round(minutes));
    var h = Math.floor(m / 60);
    return (h > 0 ? h + 'h ' : '') + (m % 60) + 'm';
  }

  /** Pages -> words, with an explicit words-per-page assumption (no hidden constant). */
  function pagesToWords(pages, wordsPerPage) {
    req(pages, 'pages');
    var wpp = isNum(wordsPerPage) ? wordsPerPage : 275;
    return { words: Math.round(pages * wpp), wordsPerPage: wpp };
  }

  /** Days needed to finish a text at a given daily reading budget. */
  function readingPlan(words, wpm, minutesPerDay) {
    var t = readingTime(words, wpm);
    var mpd = Math.max(1, minutesPerDay || 20);
    return {
      totalMinutes: t.minutes,
      minutesPerDay: mpd,
      days: Math.ceil(t.minutes / mpd),
      wordsPerDay: Math.round(wpm * mpd)
    };
  }

  /* ------------------------------------------------------- session planning */
  /**
   * Focus-block plan (Pomodoro-style, fully configurable).
   * @returns blocks with clock times, plus focus/break totals.
   */
  function planSession(o) {
    o = o || {};
    var total = clamp(Math.round(o.totalMinutes || 120), 5, 960);
    var focus = clamp(Math.round(o.focusMinutes || 25), 5, 180);
    var brk = clamp(Math.round(o.breakMinutes != null ? o.breakMinutes : 5), 0, 60);
    var longEvery = clamp(Math.round(o.longBreakEvery || 4), 0, 12);
    var longBrk = clamp(Math.round(o.longBreakMinutes != null ? o.longBreakMinutes : 15), 0, 120);
    var start = parseClock(o.startTime || '09:00');

    var blocks = [], t = start, used = 0, focusTotal = 0, breakTotal = 0, n = 0;
    while (used + focus <= total && blocks.length < 60) {
      n++;
      blocks.push({ type: 'focus', index: n, minutes: focus, start: fmtClock(t), end: fmtClock(t + focus) });
      t += focus; used += focus; focusTotal += focus;
      var isLong = longEvery > 0 && n % longEvery === 0;
      var bm = isLong ? longBrk : brk;
      if (bm > 0 && used + focus <= total) {  // no trailing break
        blocks.push({ type: isLong ? 'long-break' : 'break', minutes: bm, start: fmtClock(t), end: fmtClock(t + bm) });
        t += bm; used += bm; breakTotal += bm;
      }
    }
    return {
      blocks: blocks,
      focusBlocks: n,
      focusMinutes: focusTotal,
      breakMinutes: breakTotal,
      usedMinutes: used,
      leftoverMinutes: total - used,
      endTime: fmtClock(t),
      focusShare: used ? round2(focusTotal / used) : 0
    };
  }

  function parseClock(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
    if (!m) return 9 * 60;
    return clamp(parseInt(m[1], 10), 0, 23) * 60 + clamp(parseInt(m[2], 10), 0, 59);
  }
  function fmtClock(mins) {
    var d = ((Math.round(mins) % 1440) + 1440) % 1440;
    var h = Math.floor(d / 60), m = d % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /* ------------------------------------------------------------ interleaving */
  /**
   * Build an interleaved practice sequence: allocate `totalItems` across topics by weight
   * (largest-remainder), then order them so the same topic repeats as rarely as possible.
   */
  function interleave(o) {
    o = o || {};
    var topics = (o.topics || []).filter(function (t) { return t && t.name && (t.weight > 0); });
    var total = clamp(Math.round(o.totalItems || 20), 1, 500);
    if (!topics.length) throw new Error('Recallo: at least one topic with weight > 0 is required');

    var wsum = topics.reduce(function (a, t) { return a + t.weight; }, 0);
    var alloc = topics.map(function (t) {
      var exact = total * t.weight / wsum;
      return { name: t.name, exact: exact, count: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    var assigned = alloc.reduce(function (a, x) { return a + x.count; }, 0);
    alloc.slice().sort(function (a, b) { return b.frac - a.frac; })
      .slice(0, total - assigned).forEach(function (x) { x.count++; });

    // greedy spread: always take the topic with most remaining, avoiding the previous one
    var remaining = alloc.map(function (x) { return { name: x.name, left: x.count }; });
    var seq = [], prev = null;
    for (var i = 0; i < total; i++) {
      var pool = remaining.filter(function (x) { return x.left > 0; });
      if (!pool.length) break;
      pool.sort(function (a, b) { return b.left - a.left; });
      var pick = pool.find(function (x) { return x.name !== prev; }) || pool[0];
      pick.left--; seq.push(pick.name); prev = pick.name;
    }
    var adjacent = 0;
    for (var j = 1; j < seq.length; j++) if (seq[j] === seq[j - 1]) adjacent++;
    return {
      sequence: seq,
      allocation: alloc.map(function (x) { return { name: x.name, count: x.count, share: round2(x.count / total) }; }),
      adjacentRepeats: adjacent,
      totalItems: seq.length
    };
  }

  /* ------------------------------------------------------------------ export */
  return {
    version: '1.0.0',
    constants: { DECAY: DECAY, FACTOR: FACTOR, W5: W5, GRADES: GRADES, MATURE_DAYS: 21 },
    // FSRS
    retrievability: retrievability,
    intervalExact: intervalExact,
    nextInterval: nextInterval,
    stabilityForInterval: stabilityForInterval,
    initStability: initStability,
    initDifficulty: initDifficulty,
    nextDifficulty: nextDifficulty,
    stabilityIncrease: stabilityIncrease,
    nextStability: nextStability,
    nextStabilityForget: nextStabilityForget,
    sameDayStability: sameDayStability,
    fsrsSchedule: fsrsSchedule,
    chainIntervals: chainIntervals,
    // SM-2
    sm2Step: sm2Step,
    sm2Schedule: sm2Schedule,
    // planning
    simulateWorkload: simulateWorkload,
    retentionSweep: retentionSweep,
    examPlan: examPlan,
    cramVsSpaced: cramVsSpaced,
    // reading
    readingSpeed: readingSpeed,
    readingTime: readingTime,
    pagesToWords: pagesToWords,
    readingPlan: readingPlan,
    // sessions
    planSession: planSession,
    interleave: interleave,
    // helpers
    fmtHM: fmtHM,
    round2: round2
  };
});
