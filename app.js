/*!
 * Recallo UI layer. Reads window.RC (engine.js). No network, no tracking, no dependencies.
 * Bilingual: content is emitted as <span data-en>/<span data-zh> pairs; CSS switches on html[lang].
 */
(function () {
  'use strict';
  var RC = window.RC;
  if (!RC) return;

  /* ---------------------------------------------------------------- i18n */
  var LANGS = { en: 'en', zh: 'zh-CN' };
  function currentLang() {
    return document.documentElement.lang === 'zh-CN' ? 'zh' : 'en';
  }
  function setLang(k, remember) {
    document.documentElement.lang = LANGS[k] || 'en';
    if (remember !== false) { try { localStorage.setItem('recallo.lang', k); } catch (e) {} }
    Array.prototype.forEach.call(document.querySelectorAll('.lang button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-set') === k));
    });
  }
  function initLang() {
    var saved = null;
    try { saved = localStorage.getItem('recallo.lang'); } catch (e) {}
    var k = saved || ((navigator.language || 'en').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en');
    setLang(k, false);
    Array.prototype.forEach.call(document.querySelectorAll('.lang button'), function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-set')); });
    });
  }

  /* ------------------------------------------------------------- helpers */
  function h(html) { var d = document.createElement('div'); d.innerHTML = String(html).trim(); return d.firstElementChild; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function T(en, zh) { return '<span data-en>' + en + '</span><span data-zh>' + zh + '</span>'; }
  function n(v, d) { var x = parseFloat(v); return isFinite(x) ? x : d; }
  function f(x, d) { if (!isFinite(x)) return '–'; var p = d == null ? 1 : d; return (Math.round(x * Math.pow(10, p)) / Math.pow(10, p)).toFixed(p).replace(/\.0+$/, ''); }
  function pct(x, d) { return f(x * 100, d == null ? 1 : d) + '%'; }
  function days(x) { return x >= 365 ? f(x / 365, 1) + 'y' : (x >= 1 ? f(x, x < 10 ? 1 : 0) + 'd' : f(x * 24, 1) + 'h'); }

  function kpiRow(items) {
    return '<div class="kpis">' + items.map(function (i) {
      return '<div class="kpi ' + (i.cls || '') + '"><div class="k">' + i.k + '</div>' +
        '<div class="v">' + i.v + '</div>' + (i.u ? '<div class="u">' + i.u + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function table(cols, rows, opt) {
    opt = opt || {};
    var head = '<thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead>';
    var body = '<tbody>' + rows.map(function (r) {
      var cls = r.__mark ? ' class="mark"' : '';
      var cells = (r.cells || r);
      return '<tr' + cls + '>' + cells.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody>';
    var t = '<table>' + head + body + '</table>';
    return opt.scroll === false ? t : '<div class="table-scroll">' + t + '</div>';
  }

  /* SVG line/area chart. series = [{pts:[[x,y],...], color, fill, dash, label}] */
  function chart(o) {
    var W = 620, H = o.height || 210, L = 46, R = 12, Tp = 12, B = 30;
    var xs = [], ys = [];
    o.series.forEach(function (s) { s.pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
    if (!xs.length) return '';
    var x0 = o.xMin != null ? o.xMin : Math.min.apply(null, xs);
    var x1 = o.xMax != null ? o.xMax : Math.max.apply(null, xs);
    var y0 = o.yMin != null ? o.yMin : 0;
    var y1 = o.yMax != null ? o.yMax : Math.max.apply(null, ys);
    if (y1 === y0) y1 = y0 + 1;
    if (x1 === x0) x1 = x0 + 1;
    var px = function (x) { return L + (x - x0) / (x1 - x0) * (W - L - R); };
    var py = function (y) { return Tp + (1 - (y - y0) / (y1 - y0)) * (H - Tp - B); };

    var g = '', i, v;
    var yt = o.yTicks || 4;
    for (i = 0; i <= yt; i++) {
      v = y0 + (y1 - y0) * i / yt;
      g += '<line x1="' + L + '" y1="' + py(v).toFixed(1) + '" x2="' + (W - R) + '" y2="' + py(v).toFixed(1) + '" stroke="#e3e7f0"/>' +
        '<text x="' + (L - 7) + '" y="' + (py(v) + 4).toFixed(1) + '" text-anchor="end" font-size="10.5" fill="#6b7891">' +
        (o.yFmt ? o.yFmt(v) : f(v, v < 10 ? 1 : 0)) + '</text>';
    }
    var xt = o.xTicks || 5;
    for (i = 0; i <= xt; i++) {
      v = x0 + (x1 - x0) * i / xt;
      g += '<text x="' + px(v).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10.5" fill="#6b7891">' +
        (o.xFmt ? o.xFmt(v) : f(v, 0)) + '</text>';
    }
    o.series.forEach(function (s) {
      var d = s.pts.map(function (p, k) { return (k ? 'L' : 'M') + px(p[0]).toFixed(1) + ' ' + py(p[1]).toFixed(1); }).join(' ');
      if (s.fill) {
        g += '<path d="' + d + ' L' + px(s.pts[s.pts.length - 1][0]).toFixed(1) + ' ' + py(y0).toFixed(1) +
          ' L' + px(s.pts[0][0]).toFixed(1) + ' ' + py(y0).toFixed(1) + ' Z" fill="' + s.fill + '" stroke="none"/>';
      }
      g += '<path d="' + d + '" fill="none" stroke="' + (s.color || '#3b4fd8') + '" stroke-width="2"' +
        (s.dash ? ' stroke-dasharray="5 4"' : '') + ' stroke-linejoin="round"/>';
      if (s.dots) s.pts.forEach(function (p) { g += '<circle cx="' + px(p[0]).toFixed(1) + '" cy="' + py(p[1]).toFixed(1) + '" r="3" fill="' + (s.color || '#3b4fd8') + '"/>'; });
    });
    (o.marks || []).forEach(function (m) {
      g += '<line x1="' + px(m.x).toFixed(1) + '" y1="' + Tp + '" x2="' + px(m.x).toFixed(1) + '" y2="' + (H - B) + '" stroke="' + (m.color || '#b25e04') + '" stroke-dasharray="4 3"/>' +
        '<text x="' + (px(m.x) + 4).toFixed(1) + '" y="' + (Tp + 11) + '" font-size="10.5" fill="' + (m.color || '#b25e04') + '">' + esc(m.label || '') + '</text>';
    });
    var legend = (o.series.filter(function (s) { return s.label; }).length)
      ? '<div class="note" style="margin-top:7px">' + o.series.filter(function (s) { return s.label; }).map(function (s) {
        return '<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px">' +
          '<span style="width:14px;height:3px;border-radius:2px;background:' + (s.color || '#3b4fd8') + ';display:inline-block"></span>' + s.label + '</span>';
      }).join('') + '</div>' : '';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || 'chart') + '">' +
      '<line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '" stroke="#c9cfdd"/>' + g + '</svg>' + legend;
  }

  /* --------------------------------------------------------------- tools */
  var GN = { 1: ['Again', '重来'], 2: ['Hard', '困难'], 3: ['Good', '良好'], 4: ['Easy', '容易'] };

  var TOOLS = [
    /* ============================================================ 1 FSRS */
    {
      id: 'fsrs-scheduler',
      tag: ['Scheduling', '排程'],
      name: ['FSRS interval scheduler', 'FSRS 间隔排程器'],
      blurb: [
        'Press the grade buttons the way you would answer in Anki. Recallo runs the open-source FSRS-5 memory model and shows the interval, memory stability and difficulty after every single review.',
        '像在 Anki 里评分那样点按钮，Recallo 会用开源 FSRS-5 记忆模型逐次算出间隔、记忆稳定度与难度。'
      ],
      inputs: function () {
        return '' +
          '<div class="field"><label for="fsrs-r">' + T('Desired retention', '目标记得率') +
          ' <span class="hint">' + T('0.70 – 0.98 · Anki default 0.90', '0.70 – 0.98 · Anki 默认 0.90') + '</span></label>' +
          '<input type="number" id="fsrs-r" min="0.7" max="0.98" step="0.01" value="0.9"></div>' +
          '<div class="field"><label for="fsrs-max">' + T('Maximum interval (days)', '最长间隔（天）') + '</label>' +
          '<input type="number" id="fsrs-max" min="7" max="36500" step="1" value="36500"></div>' +
          '<div class="field"><label>' + T('Rate the card', '给这张卡评分') + '</label><div class="grades">' +
          [1, 2, 3, 4].map(function (g) {
            return '<button type="button" class="g' + g + '" data-grade="' + g + '">' + T(GN[g][0], GN[g][1]) + '</button>';
          }).join('') + '</div></div>' +
          '<div class="btn-row"><button type="button" class="btn ghost" id="fsrs-undo">' + T('Undo', '撤销') + '</button>' +
          '<button type="button" class="btn ghost" id="fsrs-reset">' + T('Reset', '重置') + '</button>' +
          '<button type="button" class="btn ghost" id="fsrs-good5">' + T('4 × Good', '4 次良好') + '</button></div>' +
          '<p class="note" id="fsrs-path"></p>';
      },
      init: function (root, out) {
        var grades = [3];
        function draw() {
          if (!grades.length) { out.innerHTML = '<p class="note">' + T('Press a grade button to start.', '点一个评分按钮开始。') + '</p>'; return; }
          var r = Math.min(0.98, Math.max(0.7, n(root.querySelector('#fsrs-r').value, 0.9)));
          var mx = Math.max(7, n(root.querySelector('#fsrs-max').value, 36500));
          var s = RC.fsrsSchedule(grades, { desiredRetention: r, maxInterval: mx });
          var last = s.rows[s.rows.length - 1];
          root.querySelector('#fsrs-path').innerHTML = T('Path: ', '评分序列：') +
            grades.map(function (g) { return T(GN[g][0], GN[g][1]); }).join(' → ');
          out.innerHTML = kpiRow([
            { k: T('Next interval', '下次间隔'), v: f(last.interval, last.interval < 10 ? 1 : 0), u: T('days', '天'), cls: 'hi' },
            { k: T('Stability', '稳定度 S'), v: f(last.stability, 1), u: T('days', '天') },
            { k: T('Difficulty', '难度 D'), v: f(last.difficulty, 2), u: '1–10' },
            { k: T('Covered span', '覆盖跨度'), v: days(s.totalDays), u: T('total', '合计') },
            { k: T('Card state', '卡片状态'), v: last.mature ? T('Mature', '成熟') : T('Young', '未成熟'), u: T('≥21d = mature', '≥21天=成熟'), cls: last.mature ? 'ok' : '' }
          ]) +
            chart({
              series: [{ pts: s.rows.map(function (x, i) { return [i + 1, x.interval]; }), color: '#3b4fd8', dots: true, label: T('Interval (days)', '间隔（天）') }],
              xMin: 1, xMax: Math.max(2, s.rows.length), xTicks: Math.min(8, Math.max(1, s.rows.length - 1)),
              yFmt: function (v) { return f(v, 0); }, aria: 'interval growth per review'
            }) +
            table([T('#', '#'), T('Grade', '评分'), T('R at review', '复习时 R'), T('Stability', 'S'), T('Difficulty', 'D'), T('Interval', '间隔'), T('Due day', '第几天')],
              s.rows.map(function (x) {
                return {
                  __mark: x === last,
                  cells: [x.review, T(GN[x.grade][0], GN[x.grade][1]), pct(x.retrievabilityAtReview, 1), f(x.stability, 2), f(x.difficulty, 2),
                    f(x.interval, x.interval < 10 ? 1 : 0) + T('d', '天'), f(x.dueOnDay, 0)]
                };
              })) +
            '<p class="note">' + T(
              '<b>R at review</b> is the model\'s recall probability at the moment the card came back. Each interval is the point where predicted recall falls to your target — that is why raising the target shortens every interval.',
              '<b>复习时 R</b> 是卡片再次出现那一刻模型预测的回忆概率。每个间隔都取在"预测记得率刚好落到目标值"的时点——所以目标越高，所有间隔都会变短。') + '</p>';
        }
        root.addEventListener('click', function (e) {
          var b = e.target.closest('[data-grade]');
          if (b) { grades.push(+b.getAttribute('data-grade')); draw(); }
        });
        root.querySelector('#fsrs-undo').addEventListener('click', function () { grades.pop(); draw(); });
        root.querySelector('#fsrs-reset').addEventListener('click', function () { grades = [3]; draw(); });
        root.querySelector('#fsrs-good5').addEventListener('click', function () { grades = [3, 3, 3, 3]; draw(); });
        root.addEventListener('input', draw);
        draw();
      }
    },

    /* ======================================================== 2 workload */
    {
      id: 'review-workload',
      tag: ['Workload', '负荷'],
      name: ['Daily review workload simulator', '每日复习负荷模拟器'],
      blurb: [
        'Adding 20 new cards a day does not cost 20 cards of work — it compounds into a review queue. This runs a card-by-card FSRS simulation day by day so you can see the queue you are signing up for before you commit.',
        '每天新增 20 张卡，代价远不止 20 张——它会滚成一条复习队列。这里逐日、逐卡跑 FSRS 模拟，让你在开始前就看清自己要背的量。'
      ],
      inputs: function () {
        return '' +
          '<div class="row"><div class="field"><label for="w-new">' + T('New cards per day', '每天新卡') + '</label>' +
          '<input type="number" id="w-new" min="0" max="500" step="1" value="20"></div>' +
          '<div class="field"><label for="w-days">' + T('Horizon (days)', '模拟天数') + '</label>' +
          '<input type="number" id="w-days" min="30" max="1825" step="5" value="365"></div></div>' +
          '<div class="row"><div class="field"><label for="w-deck">' + T('Stop at deck size', '卡库上限') +
          ' <span class="hint">' + T('blank = never stop', '留空 = 不设上限') + '</span></label>' +
          '<input type="number" id="w-deck" min="1" step="10" placeholder="∞"></div>' +
          '<div class="field"><label for="w-r">' + T('Desired retention', '目标记得率') + '</label>' +
          '<input type="number" id="w-r" min="0.7" max="0.98" step="0.01" value="0.9"></div></div>' +
          '<div class="row"><div class="field"><label for="w-sn">' + T('Seconds per new card', '每张新卡秒数') + '</label>' +
          '<input type="number" id="w-sn" min="3" max="300" step="1" value="30"></div>' +
          '<div class="field"><label for="w-sr">' + T('Seconds per review', '每次复习秒数') + '</label>' +
          '<input type="number" id="w-sr" min="2" max="120" step="1" value="12"></div></div>' +
          '<p class="note">' + T('Timing defaults are placeholders — replace them with your own average answer times for a personal estimate.',
            '时间默认值只是占位，换成你自己的平均作答时间才是个人化估算。') + '</p>';
      },
      init: function (root, out) {
        function draw() {
          var deck = root.querySelector('#w-deck').value;
          var sim = RC.simulateWorkload({
            newPerDay: n(root.querySelector('#w-new').value, 20),
            days: n(root.querySelector('#w-days').value, 365),
            deckSize: deck === '' ? Infinity : n(deck, Infinity),
            desiredRetention: n(root.querySelector('#w-r').value, 0.9),
            secPerNew: n(root.querySelector('#w-sn').value, 30),
            secPerReview: n(root.querySelector('#w-sr').value, 12)
          });
          var st = sim.steady, hardCls = st.minutesPerDay > 60 ? 'bad' : (st.minutesPerDay > 30 ? 'warn' : 'ok');
          var step = Math.max(1, Math.round(sim.series.length / 160));
          var pts = sim.series.filter(function (x, i) { return i % step === 0; });
          out.innerHTML = kpiRow([
            { k: T('Minutes / day', '每天分钟'), v: f(st.minutesPerDay, 1), u: T('last 30 d mean', '末 30 天均值'), cls: hardCls },
            { k: T('Reviews / day', '每天复习'), v: f(st.reviewsPerDay, 1), u: T('cards', '张'), cls: 'hi' },
            { k: T('Busiest day', '最忙一天'), v: f(sim.peakMinutes, 0), u: T('minutes', '分钟') },
            { k: T('Deck size', '卡库规模'), v: sim.totals.deckSize, u: T('cards', '张') },
            { k: T('Total time', '总投入'), v: f(sim.totals.hours, 1), u: T('hours', '小时') },
            { k: T('Recallable at end', '结束时可回忆'), v: pct(sim.knowledge.expectedRecallableShare, 0), u: sim.knowledge.expectedRecallable + T(' cards', ' 张') },
            { k: T('Reviews per card', '每卡复习次数'), v: f(sim.totals.reviewsPerCard, 2), u: T('lifetime', '累计') },
            { k: T('Lapse rate', '遗忘率'), v: pct(sim.totals.lapseRate, 1), u: T('of reviews', '占复习') }
          ]) +
            chart({
              series: [
                { pts: pts.map(function (x) { return [x.day, x.reviews]; }), color: '#3b4fd8', fill: 'rgba(59,79,216,.10)', label: T('Reviews due', '到期复习') },
                { pts: pts.map(function (x) { return [x.day, x.minutes]; }), color: '#b25e04', label: T('Minutes', '分钟') }
              ], xFmt: function (v) { return f(v, 0) + 'd'; }, aria: 'daily reviews and minutes over the horizon'
            }) +
            table([T('Day', '第几天'), T('New', '新卡'), T('Reviews', '复习'), T('Lapses', '遗忘'), T('Minutes', '分钟'), T('Deck', '卡库')],
              sim.series.filter(function (x) { return x.day % 30 === 0 || x.day === 1 || x.day === sim.series.length; })
                .map(function (x) { return [x.day, x.newCards, x.reviews, x.lapses, f(x.minutes, 1), x.deck]; })) +
            '<div class="flag ' + (hardCls === 'bad' ? 'bad' : hardCls === 'warn' ? 'warn' : 'ok') + '">' +
            (hardCls === 'bad'
              ? T('Over an hour a day at steady state. Most people quit here — cut new cards per day, or trim the deck.',
                '稳态下每天超过 1 小时。多数人会在这里放弃——减少每天新卡量，或精简卡库。')
              : hardCls === 'warn'
                ? T('30–60 minutes a day at steady state. Sustainable if it is your main study habit.',
                  '稳态下每天 30–60 分钟。若这是你的主要学习习惯，是可以维持的。')
                : T('Under 30 minutes a day at steady state — a load most schedules absorb.',
                  '稳态下每天不到 30 分钟——多数人的日程能吸收这个量。')) + '</div>' +
            '<p class="note">' + T(
              'Outcomes are drawn from the model\'s own recall probability with a fixed seed, so the same inputs always return the same numbers. Grade mix assumption: 10% Hard, 10% Easy, rest Good.',
              '作答结果由模型自身的回忆概率抽样、随机种子固定，因此同样输入永远得到同样结果。评分构成假设：10% 困难、10% 容易，其余良好。') + '</p>';
        }
        root.addEventListener('input', draw);
        draw();
      }
    },

    /* ======================================================= 3 retention */
    {
      id: 'retention-optimizer',
      tag: ['Trade-off', '权衡'],
      name: ['Desired-retention optimiser', '目标记得率优化器'],
      blurb: [
        'Chasing 97% recall can cost several times the daily minutes of 85% recall for a few extra remembered cards. This sweeps the setting and ranks each one by cards you can still recall per daily study minute.',
        '把记得率追到 97%，每天要花的时间可能是 85% 的数倍，却只多记住少数几张卡。这里扫描各档设置，按"每天每分钟换来多少可回忆的卡"排序。'
      ],
      inputs: function () {
        return '' +
          '<div class="row"><div class="field"><label for="o-new">' + T('New cards per day', '每天新卡') + '</label>' +
          '<input type="number" id="o-new" min="1" max="200" step="1" value="20"></div>' +
          '<div class="field"><label for="o-days">' + T('Horizon (days)', '模拟天数') + '</label>' +
          '<input type="number" id="o-days" min="90" max="1095" step="5" value="365"></div></div>' +
          '<div class="row"><div class="field"><label for="o-sn">' + T('Seconds per new card', '每张新卡秒数') + '</label>' +
          '<input type="number" id="o-sn" min="3" max="300" step="1" value="30"></div>' +
          '<div class="field"><label for="o-sr">' + T('Seconds per review', '每次复习秒数') + '</label>' +
          '<input type="number" id="o-sr" min="2" max="120" step="1" value="12"></div></div>' +
          '<div class="field"><label for="o-deck">' + T('Stop at deck size', '卡库上限') + ' <span class="hint">' + T('blank = never stop', '留空 = 不设上限') + '</span></label>' +
          '<input type="number" id="o-deck" min="1" step="10" placeholder="∞"></div>' +
          '<p class="note">' + T('Eight settings are simulated from scratch, so this takes a moment on slow devices.',
            '八档设置各自完整模拟一次，低性能设备上需要稍等。') + '</p>';
      },
      init: function (root, out) {
        var timer;
        function draw() {
          var deck = root.querySelector('#o-deck').value;
          var res = RC.retentionSweep({
            newPerDay: n(root.querySelector('#o-new').value, 20),
            days: n(root.querySelector('#o-days').value, 365),
            deckSize: deck === '' ? Infinity : n(deck, Infinity),
            secPerNew: n(root.querySelector('#o-sn').value, 30),
            secPerReview: n(root.querySelector('#o-sr').value, 12)
          });
          var best = res.best, minRows = res.rows;
          out.innerHTML = kpiRow([
            { k: T('Best value setting', '最划算设置'), v: pct(best.desiredRetention, 0), u: T('desired retention', '目标记得率'), cls: 'hi' },
            { k: T('Minutes / day there', '该档每天分钟'), v: f(best.minutesPerDay, 1), u: T('steady state', '稳态') },
            { k: T('Recalled per minute', '每分钟可回忆'), v: f(best.recalledPerMinute, 1), u: T('cards', '张') },
            { k: T('Cost of 97% vs best', '97% 相对成本'), v: '×' + f(minRows[minRows.length - 1].minutesPerDay / Math.max(0.1, best.minutesPerDay), 2), u: T('daily minutes', '每天时间') }
          ]) +
            chart({
              series: [
                { pts: minRows.map(function (r) { return [r.desiredRetention * 100, r.minutesPerDay]; }), color: '#c02a3c', dots: true, label: T('Minutes / day', '每天分钟') },
                { pts: minRows.map(function (r) { return [r.desiredRetention * 100, r.recalledPerMinute]; }), color: '#0e8a5f', dots: true, label: T('Cards recalled per daily minute', '每分钟换得的可回忆卡') }
              ], xFmt: function (v) { return f(v, 0) + '%'; }, aria: 'minutes per day and efficiency across retention settings'
            }) +
            table([T('Retention', '记得率'), T('Reviews/day', '每天复习'), T('Minutes/day', '每天分钟'), T('Reviews per card', '每卡次数'), T('Lapse rate', '遗忘率'), T('Recallable', '可回忆'), T('Per minute', '每分钟')],
              minRows.map(function (r) {
                return {
                  __mark: r === best,
                  cells: [pct(r.desiredRetention, 0), f(r.reviewsPerDay, 1), f(r.minutesPerDay, 1), f(r.reviewsPerCard, 2),
                    pct(r.lapseRate, 1), r.expectedRecallable, f(r.recalledPerMinute, 1)]
                };
              })) +
            '<p class="note">' + T(
              '<b>Read this as a trade-off, not a verdict.</b> "Cards recalled per daily minute" assumes every card is worth the same. If failing one item is expensive — a drug dose, a stage cue, a licence exam — pick a higher retention than the efficiency peak on purpose.',
              '<b>这是权衡，不是判决。</b>"每分钟可回忆卡数"假设每张卡价值相同。如果记错一项代价很高——药物剂量、演出提示、执照考试——就该主动选比效率峰值更高的记得率。') + '</p>';
        }
        function debounced() { clearTimeout(timer); timer = setTimeout(draw, 260); }
        root.addEventListener('input', debounced);
        draw();
      }
    },

    /* ============================================================ 4 exam */
    {
      id: 'exam-planner',
      tag: ['Deadline', '考期'],
      name: ['Exam-date feasibility planner', '考期可行性规划器'],
      blurb: [
        'You have a fixed number of items, a fixed date and a limited daily budget. Only two of those three are usually negotiable. This tells you whether the plan fits before you find out the hard way.',
        '要背的量固定、日期固定、每天能给的时间有限——三者通常只有两个可谈。这里在你吃到苦头之前先告诉你计划到底装不装得下。'
      ],
      inputs: function () {
        return '' +
          '<div class="row"><div class="field"><label for="e-items">' + T('Items to learn', '要学的条目') + '</label>' +
          '<input type="number" id="e-items" min="10" max="20000" step="10" value="600"></div>' +
          '<div class="field"><label for="e-days">' + T('Days until exam', '距考试天数') + '</label>' +
          '<input type="number" id="e-days" min="2" max="730" step="1" value="45"></div></div>' +
          '<div class="row"><div class="field"><label for="e-min">' + T('Minutes per day available', '每天可用分钟') + '</label>' +
          '<input type="number" id="e-min" min="5" max="600" step="5" value="40"></div>' +
          '<div class="field"><label for="e-r">' + T('Desired retention', '目标记得率') + '</label>' +
          '<input type="number" id="e-r" min="0.7" max="0.98" step="0.01" value="0.9"></div></div>' +
          '<div class="row"><div class="field"><label for="e-sn">' + T('Seconds per new item', '每条新内容秒数') + '</label>' +
          '<input type="number" id="e-sn" min="3" max="300" step="1" value="30"></div>' +
          '<div class="field"><label for="e-sr">' + T('Seconds per review', '每次复习秒数') + '</label>' +
          '<input type="number" id="e-sr" min="2" max="120" step="1" value="12"></div></div>';
      },
      init: function (root, out) {
        var timer;
        function draw() {
          var p = RC.examPlan({
            items: n(root.querySelector('#e-items').value, 600),
            daysUntilExam: n(root.querySelector('#e-days').value, 45),
            minutesPerDay: n(root.querySelector('#e-min').value, 40),
            desiredRetention: n(root.querySelector('#e-r').value, 0.9),
            secPerNew: n(root.querySelector('#e-sn').value, 30),
            secPerReview: n(root.querySelector('#e-sr').value, 12)
          });
          var step = Math.max(1, Math.round(p.series.length / 160));
          out.innerHTML = kpiRow([
            { k: T('Verdict', '结论'), v: p.feasible ? T('Fits', '装得下') : T('Too tight', '装不下'), u: T('at your budget', '按你的时间预算'), cls: p.feasible ? 'ok' : 'bad' },
            { k: T('New items / day needed', '每天需学新条目'), v: p.requiredNewPerDay, u: T('items', '条'), cls: 'hi' },
            { k: T('Mean minutes / day', '平均每天分钟'), v: f(p.meanMinutesAtRequired, 1), u: T('budget ', '预算 ') + p.minutesPerDay },
            { k: T('Busiest day', '最忙一天'), v: f(p.peakMinutesAtRequired, 0), u: T('minutes', '分钟'), cls: p.peakMinutesAtRequired > p.minutesPerDay * 1.5 ? 'warn' : '' },
            { k: T('Sustainable new / day', '可承受每天新条目'), v: p.sustainableNewPerDay, u: T('inside budget', '预算内') },
            { k: T('Covered by exam day', '考前能覆盖'), v: p.itemsCoveredWithinBudget, u: T('of ', '共 ') + p.items },
            { k: T('Recallable on exam day', '考试日可回忆'), v: p.expectedRecallableAtExam, u: pct(p.expectedRecallShare, 0) + T(' of deck', ' 覆盖率') },
            { k: T('Reviews / day in exam week', '考前一周每天复习'), v: f(p.reviewsPerDayAtExamWeek, 1), u: T('items', '条') }
          ]) +
            chart({
              series: [{ pts: p.series.filter(function (x, i) { return i % step === 0; }).map(function (x) { return [x.day, x.minutes]; }), color: '#3b4fd8', fill: 'rgba(59,79,216,.10)', label: T('Minutes needed', '需要分钟') }],
              marks: [{ x: 1, label: '' }],
              yMin: 0, xFmt: function (v) { return f(v, 0) + 'd'; }, aria: 'daily minutes needed until exam day'
            }) +
            (p.feasible
              ? '<div class="flag ok">' + T('The required pace fits your daily budget on average. Watch the busiest day above — load is front-loaded, not flat.',
                '所需进度在平均意义上装得进你的每天预算。注意上面"最忙一天"——负荷是前重后轻，不是均摊。') + '</div>'
              : '<div class="flag bad">' + T('The required pace does not fit. Three honest options: raise the daily budget to about ',
                '所需进度装不下。三个诚实的选项：把每天预算提到约 ') + '<b>' + f(p.meanMinutesAtRequired, 0) + T(' min', ' 分钟') + '</b>' +
              T(', cut the list to about ', '，把清单缩到约 ') + '<b>' + p.itemsCoveredWithinBudget + T(' items', ' 条') + '</b>' +
              T(', or lower desired retention. Starting later is not on the list.', '，或降低目标记得率。"晚点再开始"不在选项里。') + '</div>') +
            '<p class="note">' + T(
              'Feasibility is judged on the mean daily minutes across the whole run, because early days carry new items while later days carry the review queue. Reviews after the exam are ignored — this is a deadline plan, not a retention plan.',
              '可行性按整段的平均每天分钟判断，因为前期以新内容为主、后期以复习队列为主。考后的复习不计入——这是应考计划，不是长期保持计划。') + '</p>';
        }
        function debounced() { clearTimeout(timer); timer = setTimeout(draw, 200); }
        root.addEventListener('input', debounced);
        draw();
      }
    },

    /* =========================================================== 5 curve */
    {
      id: 'forgetting-curve',
      tag: ['Memory model', '记忆模型'],
      name: ['Forgetting-curve plotter', '遗忘曲线绘图器'],
      blurb: [
        'Memory decay is not a straight line and not an exponential — FSRS models it as a power function. Enter one thing you know about a card and read off the rest: half-life, recall today, and the day it drops below any threshold.',
        '记忆衰减既不是直线也不是指数——FSRS 用幂函数刻画它。只需输入你已知的一项，就能读出其余：半衰期、今天的记得率、以及跌破任一阈值的日期。'
      ],
      inputs: function () {
        return '' +
          '<div class="field"><label for="c-mode">' + T('I know…', '我已知……') + '</label>' +
          '<select id="c-mode"><option value="s">' + T('the memory stability (days)', '记忆稳定度 S（天）') + '</option>' +
          '<option value="i">' + T('an interval and the recall at its end', '一个间隔及其末端记得率') + '</option></select></div>' +
          '<div class="field" id="c-swrap"><label for="c-s">' + T('Stability S (days)', '稳定度 S（天）') +
          ' <span class="hint">' + T('days at which recall = 90%', '记得率降到 90% 所需天数') + '</span></label>' +
          '<input type="number" id="c-s" min="0.1" max="10000" step="0.5" value="12"></div>' +
          '<div class="row" id="c-iwrap" hidden><div class="field"><label for="c-i">' + T('Interval (days)', '间隔（天）') + '</label>' +
          '<input type="number" id="c-i" min="0.1" max="10000" step="1" value="30"></div>' +
          '<div class="field"><label for="c-ir">' + T('Recall at its end', '末端记得率') + '</label>' +
          '<input type="number" id="c-ir" min="0.05" max="0.995" step="0.01" value="0.8"></div></div>' +
          '<div class="field"><label for="c-h">' + T('Plot window (days)', '绘图窗口（天）') + '</label>' +
          '<input type="range" id="c-h" min="7" max="730" step="1" value="120"><div class="note" id="c-hv"></div></div>';
      },
      init: function (root, out) {
        function draw() {
          var mode = root.querySelector('#c-mode').value;
          root.querySelector('#c-swrap').hidden = mode !== 's';
          root.querySelector('#c-iwrap').hidden = mode !== 'i';
          var S;
          if (mode === 's') S = Math.max(0.1, n(root.querySelector('#c-s').value, 12));
          else S = RC.stabilityForInterval(Math.max(0.1, n(root.querySelector('#c-i').value, 30)),
            Math.min(0.995, Math.max(0.05, n(root.querySelector('#c-ir').value, 0.8))));
          var H = Math.max(7, n(root.querySelector('#c-h').value, 120));
          root.querySelector('#c-hv').innerHTML = T('Window: ', '窗口：') + f(H, 0) + T(' days', ' 天');
          var pts = [], i;
          for (i = 0; i <= 160; i++) { var t = H * i / 160; pts.push([t, RC.retrievability(t, S) * 100]); }
          var half = RC.intervalExact(0.5, S);
          var d90 = RC.intervalExact(0.9, S), d80 = RC.intervalExact(0.8, S), d70 = RC.intervalExact(0.7, S);
          var checkpoints = [1, 3, 7, 14, 21, 30, 60, 90, 180, 365].filter(function (d) { return d <= Math.max(H, 365); });
          out.innerHTML = kpiRow([
            { k: T('Stability S', '稳定度 S'), v: f(S, 2), u: T('days', '天'), cls: 'hi' },
            { k: T('Half-life', '半衰期'), v: days(half), u: T('recall = 50%', '记得率 = 50%') },
            { k: T('Recall at 90%', '记得率 90%'), v: days(d90), u: T('after review', '复习后') },
            { k: T('Recall at 80%', '记得率 80%'), v: days(d80), u: T('after review', '复习后') },
            { k: T('Recall at 70%', '记得率 70%'), v: days(d70), u: T('after review', '复习后') },
            { k: T('Recall at window end', '窗口末端记得率'), v: pct(RC.retrievability(H, S), 1), u: T('day ', '第 ') + f(H, 0) }
          ]) +
            chart({
              series: [{ pts: pts, color: '#3b4fd8', fill: 'rgba(59,79,216,.10)', label: T('Predicted recall %', '预测记得率 %') }],
              yMin: 0, yMax: 100, marks: [{ x: Math.min(half, H), label: T('half-life', '半衰期') }],
              xFmt: function (v) { return f(v, 0) + 'd'; }, yFmt: function (v) { return f(v, 0) + '%'; },
              aria: 'power-function forgetting curve', height: 230
            }) +
            table([T('Days since review', '距上次复习'), T('Predicted recall', '预测记得率'), T('Forgotten out of 100 cards', '每 100 张已忘')],
              checkpoints.map(function (d) {
                var r = RC.retrievability(d, S);
                return [f(d, 0), pct(r, 1), Math.round((1 - r) * 100)];
              })) +
            '<div class="formula">R(t, S) = (1 + <b>19/81</b> · t / S) <sup>−0.5</sup> &nbsp; · &nbsp; S = t / ((r<sup>−2</sup> − 1) · 81/19)</div>' +
            '<p class="note">' + T(
              'A power curve has a long tail: the first days after a review are where most forgetting happens, and a card at 40% recall keeps limping along for months instead of vanishing. That tail is why late reviews are recoverable.',
              '幂函数曲线有长尾：复习后的头几天流失最多，而记得率掉到 40% 的卡还能拖上好几个月，不会立刻归零。正是这条长尾让"迟到的复习"仍然救得回来。') + '</p>';
        }
        root.addEventListener('input', draw);
        root.addEventListener('change', draw);
        draw();
      }
    },

    /* ============================================================ 6 cram */
    {
      id: 'cram-vs-spaced',
      tag: ['Spacing', '间隔'],
      name: ['Cram vs spaced comparison', '临时抱佛脚 vs 间隔复习'],
      blurb: [
        'Same number of repetitions, two different calendars. One evening of four passes versus four passes spread over two weeks — the model shows what each buys you on exam day, and a month after it.',
        '同样的复习次数，两种排法。一个晚上连做四遍，还是两周内分四次做完——模型会算出各自在考试当天、以及一个月后分别值多少。'
      ],
      inputs: function () {
        return '' +
          '<div class="row"><div class="field"><label for="k-reps">' + T('Repetitions', '复习次数') + '</label>' +
          '<input type="number" id="k-reps" min="1" max="20" step="1" value="4"></div>' +
          '<div class="field"><label for="k-days">' + T('Days until exam', '距考试天数') + '</label>' +
          '<input type="number" id="k-days" min="1" max="365" step="1" value="14"></div></div>' +
          '<div class="field"><label for="k-later">' + T('Also check this many days after the exam', '再检查考后多少天') + '</label>' +
          '<input type="number" id="k-later" min="0" max="365" step="5" value="30"></div>';
      },
      init: function (root, out) {
        function draw() {
          var c = RC.cramVsSpaced({
            repetitions: n(root.querySelector('#k-reps').value, 4),
            daysUntilExam: n(root.querySelector('#k-days').value, 14),
            laterDays: n(root.querySelector('#k-later').value, 30)
          });
          var H = c.daysUntilExam + c.laterDays, i, mp = [], sp = [];
          for (i = 0; i <= 160; i++) {
            var t = H * i / 160;
            mp.push([t, RC.retrievability(t, c.massed.stability) * 100]);
            var lastRep = c.spaced.schedule[c.spaced.schedule.length - 1];
            sp.push([t, t < lastRep ? null : RC.retrievability(t - lastRep, c.spaced.stability) * 100]);
          }
          sp = sp.filter(function (p) { return p[1] !== null; });
          out.innerHTML = kpiRow([
            { k: T('Spaced, exam day', '间隔·考试当天'), v: pct(c.spaced.retentionAtExam, 1), u: T('predicted recall', '预测记得率'), cls: 'ok' },
            { k: T('Massed, exam day', '集中·考试当天'), v: pct(c.massed.retentionAtExam, 1), u: T('predicted recall', '预测记得率'), cls: 'warn' },
            { k: T('Exam-day gap', '考试当天差距'), v: (c.examAdvantage >= 0 ? '+' : '') + f(c.examAdvantage, 1), u: T('points, spaced − massed', '个百分点，间隔−集中'), cls: 'hi' },
            { k: T('Gap ', '考后 ') + c.laterDays + T(' days later', ' 天差距'), v: (c.laterAdvantage >= 0 ? '+' : '') + f(c.laterAdvantage, 1), u: T('points', '个百分点') },
            { k: T('Stability, spaced', '稳定度·间隔'), v: f(c.spaced.stability, 1), u: T('days', '天') },
            { k: T('Stability, massed', '稳定度·集中'), v: f(c.massed.stability, 1), u: T('days', '天') }
          ]) +
            chart({
              series: [
                { pts: sp, color: '#0e8a5f', label: T('Spaced', '间隔复习') },
                { pts: mp, color: '#c02a3c', dash: true, label: T('Massed (one session)', '集中（单次）') }
              ], yMin: 0, yMax: 100, marks: [{ x: c.daysUntilExam, label: T('exam', '考试') }],
              xFmt: function (v) { return f(v, 0) + 'd'; }, yFmt: function (v) { return f(v, 0) + '%'; }, height: 230,
              aria: 'recall over time for massed versus spaced repetition'
            }) +
            table([T('Plan', '方案'), T('Sessions', '场次'), T('Final stability', '最终稳定度'), T('Recall on exam day', '考试当天记得率'), T('Recall ', '考后 ') + c.laterDays + T(' d later', ' 天记得率')], [
              [T('Massed (cram)', '集中（抱佛脚）'), c.massed.sessions, f(c.massed.stability, 2) + T('d', '天'), pct(c.massed.retentionAtExam, 1), pct(c.massed.retentionLater, 1)],
              { __mark: true, cells: [T('Spaced', '间隔复习'), c.spaced.sessions, f(c.spaced.stability, 2) + T('d', '天'), pct(c.spaced.retentionAtExam, 1), pct(c.spaced.retentionLater, 1)] }
            ], { scroll: false }) +
            '<p class="note">' + T('Spaced session days: ', '间隔复习安排在第 ') + '<span class="mono">' +
            c.spaced.schedule.map(function (d) { return 'd' + d; }).join(' · ') + '</span>' +
            T('. The last one lands on or before exam day.', ' 天，最后一次不晚于考试当天。') + '</p>' +
            (c.daysUntilExam <= 2
              ? '<div class="flag warn">' + T('With the exam this close, cramming can win on the day — the honest gap shows up in the "later" column. If you only need it for the exam, cram; if you need it next term, do not.',
                '考试已在眼前，集中复习在当天可能反而占优——真正的差距体现在"考后"那一列。只为过考，就抱佛脚；下学期还要用，就别。') + '</div>'
              : '<div class="flag ok">' + T('Same effort, different calendar. The spacing advantage grows the further past the exam you look.',
                '同样的投入，不同的排法。看得越远，间隔复习的优势越大。') + '</div>') +
            '<p class="note">' + T(
              'Both paths assume every repetition is a successful "Good". Massed repetitions use the model\'s same-day update, which deliberately credits them far less than a spaced review — that is the mechanism behind the spacing effect here, not an assumption bolted on afterwards.',
              '两条路径都假设每次复习都成功且评为"良好"。集中复习走模型的同日更新规则，其加成远小于隔日复习——这正是此处间隔效应的产生机制，而非事后附加的假设。') + '</p>';
        }
        root.addEventListener('input', draw);
        draw();
      }
    },

    /* ============================================================ 7 sm-2 */
    {
      id: 'sm2-scheduler',
      tag: ['Classic', '经典'],
      name: ['SM-2 interval calculator', 'SM-2 间隔计算器'],
      blurb: [
        'SM-2 (SuperMemo 2, 1987) is still the scheduler inside Anki\'s legacy mode, Mnemosyne and dozens of apps. Rate a card 0–5 and watch the ease factor and intervals evolve exactly as the published algorithm specifies.',
        'SM-2（SuperMemo 2，1987）至今仍是 Anki 旧版模式、Mnemosyne 及许多应用的排程内核。按 0–5 评分，逐步看简易度与间隔如何按公开算法演化。'
      ],
      inputs: function () {
        var qn = [['0 · blackout', '0 · 完全空白'], ['1 · wrong, familiar', '1 · 答错但眼熟'], ['2 · wrong, easy to recall', '2 · 答错但差一点'],
          ['3 · correct, hard', '3 · 答对但很吃力'], ['4 · correct, hesitant', '4 · 答对略有迟疑'], ['5 · perfect', '5 · 完全流畅']];
        return '' +
          '<div class="field"><label for="s-ef">' + T('Starting ease factor', '初始简易度 EF') +
          ' <span class="hint">' + T('SM-2 default 2.5, floor 1.3', 'SM-2 默认 2.5，下限 1.3') + '</span></label>' +
          '<input type="number" id="s-ef" min="1.3" max="4" step="0.05" value="2.5"></div>' +
          '<div class="field"><label>' + T('Grade the recall (0–5)', '给回忆质量评分（0–5）') + '</label><div class="grades">' +
          qn.map(function (q, i) { return '<button type="button" class="' + (i < 3 ? 'g1' : '') + '" data-q="' + i + '">' + T(q[0], q[1]) + '</button>'; }).join('') +
          '</div></div>' +
          '<div class="btn-row"><button type="button" class="btn ghost" id="s-undo">' + T('Undo', '撤销') + '</button>' +
          '<button type="button" class="btn ghost" id="s-reset">' + T('Reset', '重置') + '</button>' +
          '<button type="button" class="btn ghost" id="s-demo">' + T('5 × grade 4', '5 次评 4 分') + '</button></div>';
      },
      init: function (root, out) {
        var qs = [4];
        function draw() {
          if (!qs.length) { out.innerHTML = '<p class="note">' + T('Grade a card to start.', '先给一张卡评分。') + '</p>'; return; }
          var s = RC.sm2Schedule(qs, n(root.querySelector('#s-ef').value, 2.5));
          var last = s.rows[s.rows.length - 1];
          out.innerHTML = kpiRow([
            { k: T('Next interval', '下次间隔'), v: last.interval, u: T('days', '天'), cls: 'hi' },
            { k: T('Ease factor', '简易度 EF'), v: f(s.finalEf, 2), u: last.ef <= 1.3 ? T('at floor', '已触下限') : '', cls: s.finalEf <= 1.6 ? 'bad' : '' },
            { k: T('Repetitions', '成功次数'), v: last.reps, u: T('since last lapse', '自上次遗忘起') },
            { k: T('Span covered', '覆盖跨度'), v: days(s.totalDays), u: T('total', '合计') },
            { k: T('Lapses', '遗忘次数'), v: s.rows.filter(function (r) { return r.lapsed; }).length, u: T('resets', '重置') }
          ]) +
            chart({
              series: [{ pts: s.rows.map(function (r, i) { return [i + 1, r.interval]; }), color: '#6a5cf0', dots: true, label: T('Interval (days)', '间隔（天）') }],
              xMin: 1, xMax: Math.max(2, s.rows.length), xTicks: Math.min(8, Math.max(1, s.rows.length - 1)),
              yFmt: function (v) { return f(v, 0); }, aria: 'SM-2 interval growth'
            }) +
            table([T('#', '#'), T('Quality', '评分 q'), T('EF after', '更新后 EF'), T('Interval', '间隔'), T('Due day', '第几天'), T('Result', '结果')],
              s.rows.map(function (r) {
                return {
                  __mark: r === last,
                  cells: [r.review, r.quality, f(r.ef, 2), r.interval + T('d', '天'), r.dueOnDay,
                    r.lapsed ? T('lapse → restart', '遗忘 → 重置') : T('pass', '通过')]
                };
              })) +
            '<div class="formula">EF&prime; = EF + (0.1 − (5 − q) · (0.08 + (5 − q) · 0.02)) &nbsp;<b>·</b>&nbsp; I<sub>1</sub>=1, I<sub>2</sub>=6, I<sub>n</sub> = round(I<sub>n−1</sub> · EF)</div>' +
            '<p class="note">' + T(
              '<b>The famous flaw:</b> a lapse sends the interval back to 1 day no matter how well the card was known before. FSRS keeps memory stability instead, which is why a lapsed mature card there returns in days rather than tomorrow. Compare the two in the FSRS scheduler.',
              '<b>它最著名的缺陷：</b>一次遗忘就把间隔打回 1 天，不管这张卡此前记得多牢。FSRS 保留记忆稳定度，因此那边遗忘一张成熟卡后是几天后再见，而非明天。可与 FSRS 排程器对照。') + '</p>';
        }
        root.addEventListener('click', function (e) {
          var b = e.target.closest('[data-q]');
          if (b) { qs.push(+b.getAttribute('data-q')); draw(); }
        });
        root.querySelector('#s-undo').addEventListener('click', function () { qs.pop(); draw(); });
        root.querySelector('#s-reset').addEventListener('click', function () { qs = [4]; draw(); });
        root.querySelector('#s-demo').addEventListener('click', function () { qs = [4, 4, 4, 4, 4]; draw(); });
        root.addEventListener('input', draw);
        draw();
      }
    },

    /* ========================================================= 8 reading */
    {
      id: 'reading-planner',
      tag: ['Throughput', '吞吐'],
      name: ['Reading speed & syllabus planner', '阅读速度与书单规划器'],
      blurb: [
        'Time yourself on a page you actually have, then turn that measured rate into a finish date for the whole book or reading list. No stock "average reader" number is assumed anywhere.',
        '用你手上真实的一页文字给自己计时，再把测得的速度换成整本书或整份书单的完成日期。全程不套用任何"平均读者"的现成数字。'
      ],
      inputs: function () {
        return '' +
          '<div class="field"><label>' + T('Step 1 · measure your rate', '第一步 · 测你的速度') + '</label>' +
          '<div class="row"><div><input type="number" id="r-words" min="20" step="10" value="500" aria-label="words read">' +
          '<div class="note">' + T('words you read', '你读了多少词') + '</div></div>' +
          '<div><input type="number" id="r-secs" min="5" step="1" value="120" aria-label="seconds taken">' +
          '<div class="note">' + T('seconds it took', '用了多少秒') + '</div></div></div>' +
          '<div class="btn-row"><button type="button" class="btn ghost" id="r-start">' + T('Start timer', '开始计时') + '</button>' +
          '<button type="button" class="btn ghost" id="r-stop">' + T('Stop & fill seconds', '停止并填入秒数') + '</button></div>' +
          '<div class="big-timer" id="r-clock" hidden>0:00</div></div>' +
          '<div class="field"><label for="r-unit">' + T('Step 2 · how long is the text?', '第二步 · 文本有多长？') + '</label>' +
          '<select id="r-unit"><option value="w">' + T('I know the word count', '我知道总词数') + '</option>' +
          '<option value="p">' + T('I only know the page count', '我只知道页数') + '</option></select></div>' +
          '<div class="field" id="r-wwrap"><label for="r-total">' + T('Total words', '总词数') + '</label>' +
          '<input type="number" id="r-total" min="100" step="1000" value="90000"></div>' +
          '<div class="row" id="r-pwrap" hidden><div class="field"><label for="r-pages">' + T('Pages', '页数') + '</label>' +
          '<input type="number" id="r-pages" min="1" step="10" value="320"></div>' +
          '<div class="field"><label for="r-wpp">' + T('Words per page', '每页词数') +
          ' <span class="hint">' + T('count one page yourself', '自己数一页') + '</span></label>' +
          '<input type="number" id="r-wpp" min="50" max="1200" step="5" value="275"></div></div>' +
          '<div class="field"><label for="r-mpd">' + T('Step 3 · minutes per day', '第三步 · 每天分钟') + '</label>' +
          '<input type="number" id="r-mpd" min="5" max="600" step="5" value="30"></div>';
      },
      init: function (root, out) {
        var t0 = null, iv = null;
        var clock = root.querySelector('#r-clock');
        function tick() {
          var s = Math.round((Date.now() - t0) / 1000);
          clock.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        }
        root.querySelector('#r-start').addEventListener('click', function () {
          t0 = Date.now(); clock.hidden = false; clearInterval(iv); iv = setInterval(tick, 250); tick();
        });
        root.querySelector('#r-stop').addEventListener('click', function () {
          if (!t0) return; clearInterval(iv);
          root.querySelector('#r-secs').value = Math.max(1, Math.round((Date.now() - t0) / 1000));
          t0 = null; draw();
        });
        function draw() {
          var unit = root.querySelector('#r-unit').value;
          root.querySelector('#r-wwrap').hidden = unit !== 'w';
          root.querySelector('#r-pwrap').hidden = unit !== 'p';
          var wpm, err = '';
          try { wpm = RC.readingSpeed(n(root.querySelector('#r-words').value, 500), Math.max(1, n(root.querySelector('#r-secs').value, 120))); }
          catch (e) { wpm = 200; err = e.message; }
          var words, wppNote = '';
          if (unit === 'p') {
            var pw = RC.pagesToWords(n(root.querySelector('#r-pages').value, 320), n(root.querySelector('#r-wpp').value, 275));
            words = pw.words;
            wppNote = T('Assuming ', '按每页 ') + pw.wordsPerPage + T(' words per page — an input, not a fact about your book.', ' 词计算——这是你填的假设，不是关于这本书的事实。');
          } else words = Math.max(1, n(root.querySelector('#r-total').value, 90000));
          var tt = RC.readingTime(words, wpm);
          var plan = RC.readingPlan(words, wpm, n(root.querySelector('#r-mpd').value, 30));
          var weeks = plan.days / 7;
          out.innerHTML = kpiRow([
            { k: T('Your measured rate', '你的实测速度'), v: f(wpm, 0), u: T('words / minute', '词/分钟'), cls: 'hi' },
            { k: T('Total reading time', '总阅读时长'), v: tt.hhmm, u: f(tt.hours, 1) + T(' hours', ' 小时') },
            { k: T('Days to finish', '完成天数'), v: plan.days, u: f(weeks, 1) + T(' weeks', ' 周') },
            { k: T('Words per session', '每次读多少词'), v: plan.wordsPerDay, u: plan.minutesPerDay + T(' min', ' 分钟') },
            { k: T('Text length', '文本长度'), v: f(words / 1000, 1) + 'k', u: T('words', '词') }
          ]) +
            chart({
              series: [{ pts: (function () { var a = [], d; for (d = 0; d <= plan.days; d++) a.push([d, Math.min(100, d * plan.wordsPerDay / words * 100)]); return a; })(), color: '#0e8a5f', fill: 'rgba(14,138,95,.10)', label: T('Cumulative progress', '累计进度') }],
              yMin: 0, yMax: 100, xFmt: function (v) { return f(v, 0) + 'd'; }, yFmt: function (v) { return f(v, 0) + '%'; },
              aria: 'cumulative reading progress'
            }) +
            table([T('Daily budget', '每天预算'), T('Days to finish', '完成天数'), T('Finish in', '大约用时')],
              [10, 15, 20, 30, 45, 60, 90].map(function (m) {
                var p = RC.readingPlan(words, wpm, m);
                return { __mark: m === plan.minutesPerDay, cells: [m + T(' min', ' 分钟'), p.days, f(p.days / 7, 1) + T(' weeks', ' 周')] };
              })) +
            (wppNote ? '<p class="note">' + wppNote + '</p>' : '') +
            '<p class="note">' + T(
              '<b>Measure, don\'t guess.</b> Reading rate varies enormously with material: the same person may read fiction three times faster than a dense textbook. Re-measure on the actual book you are planning, and re-measure again if you are testing comprehension rather than page-turning.',
              '<b>要测，不要猜。</b>阅读速度随材料剧烈变化：同一个人读小说可能比读硬教材快三倍。就用你要规划的那本书重新测；如果你在意的是理解而非翻页，更要重测。') +
            (err ? ' <b>' + esc(err) + '</b>' : '') + '</p>';
        }
        root.addEventListener('input', draw);
        root.addEventListener('change', draw);
        draw();
      }
    },

    /* =========================================================== 9 focus */
    {
      id: 'focus-blocks',
      tag: ['Sessions', '专注块'],
      name: ['Focus-block session planner', '专注块时段规划器'],
      blurb: [
        'Turn "I have three hours tonight" into a printable schedule with real clock times, including where the long breaks fall and how much of the block is actually focus rather than break.',
        '把"今晚有三小时"变成一份带真实钟点的可打印时间表：长休息落在哪里、真正专注占多少、一目了然。'
      ],
      inputs: function () {
        return '' +
          '<div class="row"><div class="field"><label for="p-total">' + T('Total session (minutes)', '总时长（分钟）') + '</label>' +
          '<input type="number" id="p-total" min="10" max="960" step="5" value="180"></div>' +
          '<div class="field"><label for="p-start">' + T('Start time', '开始时间') + '</label>' +
          '<input type="time" id="p-start" value="19:00"></div></div>' +
          '<div class="row"><div class="field"><label for="p-focus">' + T('Focus block (minutes)', '专注块（分钟）') + '</label>' +
          '<input type="number" id="p-focus" min="5" max="180" step="5" value="25"></div>' +
          '<div class="field"><label for="p-break">' + T('Short break (minutes)', '短休息（分钟）') + '</label>' +
          '<input type="number" id="p-break" min="0" max="60" step="1" value="5"></div></div>' +
          '<div class="row"><div class="field"><label for="p-every">' + T('Long break every N blocks', '每 N 块一次长休') + '</label>' +
          '<input type="number" id="p-every" min="0" max="12" step="1" value="4"></div>' +
          '<div class="field"><label for="p-long">' + T('Long break (minutes)', '长休息（分钟）') + '</label>' +
          '<input type="number" id="p-long" min="0" max="120" step="5" value="15"></div></div>' +
          '<p class="note">' + T('25/5 is the classic Pomodoro setting, not a law of biology. Longer blocks suit maths and writing; shorter blocks suit flashcards and rote drilling.',
            '25/5 是经典番茄钟设定，不是生理定律。数学、写作适合更长的块；抽认卡、机械操练适合更短的块。') + '</p>';
      },
      init: function (root, out) {
        function draw() {
          var p = RC.planSession({
            totalMinutes: n(root.querySelector('#p-total').value, 180),
            focusMinutes: n(root.querySelector('#p-focus').value, 25),
            breakMinutes: n(root.querySelector('#p-break').value, 5),
            longBreakEvery: n(root.querySelector('#p-every').value, 4),
            longBreakMinutes: n(root.querySelector('#p-long').value, 15),
            startTime: root.querySelector('#p-start').value || '19:00'
          });
          out.innerHTML = kpiRow([
            { k: T('Focus blocks', '专注块数'), v: p.focusBlocks, u: T('sessions', '个'), cls: 'hi' },
            { k: T('Focus time', '专注时间'), v: RC.fmtHM(p.focusMinutes), u: pct(p.focusShare, 0) + T(' of session', ' 占全程') },
            { k: T('Break time', '休息时间'), v: RC.fmtHM(p.breakMinutes), u: T('total', '合计') },
            { k: T('Ends at', '结束于'), v: p.endTime, u: T('clock time', '钟点') },
            { k: T('Unused', '未排入'), v: RC.fmtHM(p.leftoverMinutes), u: T('too short for a block', '不足一个完整块') }
          ]) +
            '<ul class="timeline">' + p.blocks.map(function (b) {
              return '<li class="' + (b.type === 'focus' ? '' : 'break') + '"><span class="t">' + b.start + ' – ' + b.end + '</span>' +
                '<span>' + (b.type === 'focus' ? '<b>' + T('Focus ', '专注 ') + b.index + '</b>' : (b.type === 'long-break' ? T('Long break', '长休息') : T('Break', '短休息'))) +
                ' · ' + b.minutes + T(' min', ' 分钟') + '</span></li>';
            }).join('') + '</ul>' +
            '<p class="note">' + T(
              '<b>Use the breaks as breaks.</b> A break spent scrolling a feed keeps the same attention system busy; walking, stretching, water or staring out of a window is what makes the next block feel different from the last. The plan above also prints cleanly — press Ctrl/⌘+P.',
              '<b>让休息真的是休息。</b>刷信息流的休息仍在占用同一套注意力系统；走动、伸展、喝水或看看窗外，才能让下一块和上一块不一样。上面的计划可直接打印——按 Ctrl/⌘+P。') + '</p>';
        }
        root.addEventListener('input', draw);
        draw();
      }
    },

    /* ===================================================== 10 interleave */
    {
      id: 'interleaving',
      tag: ['Practice order', '练习顺序'],
      name: ['Interleaved practice generator', '交错练习生成器'],
      blurb: [
        'Blocked practice — all of topic A, then all of topic B — feels smoother and usually tests worse, because you never have to work out which method the problem needs. This builds a weighted interleaved order you can practise from directly.',
        '按块练习——先把 A 全做完再做 B——手感更顺，但考试往往更差，因为你从不需要判断该用哪种方法。这里按权重生成可直接照着练的交错顺序。'
      ],
      inputs: function () {
        return '' +
          '<div class="field"><label for="i-topics">' + T('Topics and weights', '主题与权重') +
          ' <span class="hint">' + T('one per line: name, weight', '每行一个：名称, 权重') + '</span></label>' +
          '<textarea id="i-topics" rows="6">' +
          'Derivatives, 3\nIntegrals, 3\nLimits, 2\nSeries, 1</textarea></div>' +
          '<div class="field"><label for="i-total">' + T('Total practice items', '练习总题数') + '</label>' +
          '<input type="number" id="i-total" min="4" max="300" step="2" value="24"></div>' +
          '<div class="btn-row"><button type="button" class="btn ghost" id="i-load1">' + T('Example: languages', '示例：语言') + '</button>' +
          '<button type="button" class="btn ghost" id="i-load2">' + T('Example: music', '示例：音乐') + '</button></div>';
      },
      init: function (root, out) {
        var ta = root.querySelector('#i-topics');
        root.querySelector('#i-load1').addEventListener('click', function () {
          ta.value = 'Vocabulary, 4\nListening, 3\nGrammar drills, 2\nSpeaking aloud, 3'; draw();
        });
        root.querySelector('#i-load2').addEventListener('click', function () {
          ta.value = 'Scales, 2\nSight-reading, 3\nRepertoire A, 3\nRepertoire B, 2'; draw();
        });
        function draw() {
          var topics = ta.value.split('\n').map(function (l) {
            var parts = l.split(/[,，;\t]/);
            var name = (parts[0] || '').trim();
            var w = parseFloat((parts[1] || '1').trim());
            return { name: name, weight: isFinite(w) && w > 0 ? w : (name ? 1 : 0) };
          }).filter(function (t) { return t.name && t.weight > 0; });
          if (!topics.length) {
            out.innerHTML = '<div class="flag warn">' + T('Add at least one topic with a positive weight.', '至少填一个权重为正的主题。') + '</div>';
            return;
          }
          var res;
          try { res = RC.interleave({ topics: topics, totalItems: n(root.querySelector('#i-total').value, 24) }); }
          catch (e) { out.innerHTML = '<div class="flag bad">' + esc(e.message) + '</div>'; return; }
          var idx = {};
          res.allocation.forEach(function (a, i) { idx[a.name] = (i % 4) + 1; });
          out.innerHTML = kpiRow([
            { k: T('Items', '题数'), v: res.totalItems, u: T('in sequence', '已排入'), cls: 'hi' },
            { k: T('Topics', '主题数'), v: res.allocation.length, u: T('interleaved', '交错') },
            { k: T('Back-to-back repeats', '相邻同主题'), v: res.adjacentRepeats, u: res.adjacentRepeats === 0 ? T('fully interleaved', '完全交错') : T('unavoidable', '无法避免'), cls: res.adjacentRepeats === 0 ? 'ok' : 'warn' }
          ]) +
            '<ol class="seq">' + res.sequence.map(function (s, i) {
              return '<li class="t' + idx[s] + '">' + (i + 1) + '. ' + esc(s) + '</li>';
            }).join('') + '</ol>' +
            '<div style="height:14px"></div>' +
            table([T('Topic', '主题'), T('Items', '题数'), T('Share', '占比')],
              res.allocation.map(function (a) { return [esc(a.name), a.count, pct(a.share, 0)]; }), { scroll: false }) +
            '<p class="note">' + T(
              '<b>Expect it to feel worse.</b> Interleaving is harder in the moment and that is the point — you practise selecting the method, not just executing it. Keep blocked practice for the first exposure to something genuinely new, then switch.',
              '<b>它本来就该感觉更难。</b>交错练习当下更吃力，这正是意义所在——你练的是"选方法"，不只是"执行方法"。真正的新内容第一次接触仍可按块练，之后再切换。') + '</p>';
        }
        root.addEventListener('input', draw);
        draw();
      }
    }
  ];

  /* ------------------------------------------------------------- mounting */
  function benchHTML(tool) {
    return '<div class="bench" id="bench-' + tool.id + '">' +
      '<div class="bench-head"><span class="tag">' + T(tool.tag[0], tool.tag[1]) + '</span>' +
      '<h2>' + T(tool.name[0], tool.name[1]) + '</h2>' +
      '<p>' + T(tool.blurb[0], tool.blurb[1]) + '</p></div>' +
      '<div class="bench-body"><div class="inputs"></div><div class="outputs"></div></div></div>';
  }

  function mount(tool, host) {
    host.innerHTML = benchHTML(tool);
    var inputs = host.querySelector('.inputs');
    var outputs = host.querySelector('.outputs');
    inputs.innerHTML = tool.inputs();
    tool.init(inputs, outputs);
  }

  function pickerHTML(activeId) {
    return '<div class="grid tools">' + TOOLS.map(function (t) {
      return '<button type="button" class="tool-card" data-tool="' + t.id + '"' + (t.id === activeId ? ' aria-current="true"' : '') + '>' +
        '<span class="tag">' + T(t.tag[0], t.tag[1]) + '</span>' +
        '<h3>' + T(t.name[0], t.name[1]) + '</h3>' +
        '<p>' + T(t.blurb[0].split('.')[0] + '.', t.blurb[1].split('。')[0] + '。') + '</p></button>';
    }).join('') + '</div>';
  }

  function boot() {
    initLang();
    var host = document.getElementById('bench-host');
    if (!host) return;
    var only = document.body.getAttribute('data-tool');
    var tool = only ? TOOLS.filter(function (t) { return t.id === only; })[0] : null;

    if (tool) { mount(tool, host); return; }

    var picker = document.getElementById('tool-picker');
    var startId = (location.hash || '').replace('#', '') || TOOLS[0].id;
    var active = TOOLS.filter(function (t) { return t.id === startId; })[0] || TOOLS[0];
    if (picker) {
      picker.innerHTML = pickerHTML(active.id);
      picker.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tool]');
        if (!b) return;
        var t = TOOLS.filter(function (x) { return x.id === b.getAttribute('data-tool'); })[0];
        if (!t) return;
        Array.prototype.forEach.call(picker.querySelectorAll('.tool-card'), function (c) { c.removeAttribute('aria-current'); });
        b.setAttribute('aria-current', 'true');
        history.replaceState(null, '', '#' + t.id);
        mount(t, host);
        host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    mount(active, host);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
