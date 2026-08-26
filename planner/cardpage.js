/* 销卡查询页：查一张卡可以去哪里销、哪些任务需要它保留 */
(function () {
  'use strict';
  var P = window.PLANNER;
  var DATA = P.DATA;

  var GRADES = ['岩石', '青铜', '白银', '黄金'];
  var SULTAN_TYPES = ['杀戮', '纵欲', '奢靡', '征服'];

  /* ---------- 索引 ---------- */
  // slot 卡名 -> [{ch, rt, st, slot}]
  var slotIndex = {};
  DATA.chapters.forEach(function (ch) {
    ch.routes.forEach(function (rt) {
      rt.steps.forEach(function (st) {
        (st.slots || []).forEach(function (sl) {
          (slotIndex[sl.card] = slotIndex[sl.card] || []).push({ ch: ch, rt: rt, st: st, slot: sl });
        });
      });
    });
  });

  // 卡名候选集合：图鉴卡名 + 卡槽卡名 + 篇章角色
  var cardNames = {};
  DATA.cards.forEach(function (c) { cardNames[c.name] = true; });
  Object.keys(slotIndex).forEach(function (n) { cardNames[n] = true; });
  DATA.chapters.forEach(function (ch) {
    (ch.characters || []).forEach(function (n) { cardNames[n] = true; });
  });
  var allNames = Object.keys(cardNames).sort();

  var catalogByName = {};
  DATA.cards.forEach(function (c) {
    (catalogByName[c.name] = catalogByName[c.name] || []).push(c);
  });

  function isSultan(name) { return SULTAN_TYPES.indexOf(name) >= 0; }

  // 解析"奢靡（青铜）" -> {base:'奢靡', grade:'青铜'}
  function parseName(name) {
    var m = name.match(/^(.+?)（(岩石|青铜|白银|黄金)）$/);
    if (m) return { base: m[1], grade: m[2] };
    return { base: name, grade: null };
  }

  // 品级是否满足槽位上限（slot 的 maxGrade 是允许的最高品级；null=不限/动态）
  function gradeFits(slotMax, cardGrade) {
    if (!cardGrade) return true;            // 查询时未指定品级：全显示
    if (!slotMax) return true;              // 槽位不限品级
    return GRADES.indexOf(cardGrade) <= GRADES.indexOf(slotMax);
  }

  /* ---------- 视图切换 ---------- */
  var viewBtns = document.querySelectorAll('#viewNav button');
  function switchView(v) {
    document.getElementById('layout').classList.toggle('hidden', v !== 'planner');
    document.getElementById('cardPage').classList.toggle('hidden', v !== 'cards');
    viewBtns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === v); });
    if (v === 'cards' && currentQuery) renderResult();
  }
  viewBtns.forEach(function (b) {
    b.onclick = function () { switchView(b.getAttribute('data-view')); };
  });

  /* ---------- 卡名输入与建议 ---------- */
  var input = document.getElementById('cardSearch');
  var sugBox = document.getElementById('cardSuggest');

  function showSuggest() {
    var kw = input.value.trim();
    sugBox.innerHTML = '';
    if (!kw) { sugBox.classList.add('hidden'); return; }
    var hits = allNames.filter(function (n) { return n.indexOf(kw) >= 0; }).slice(0, 30);
    if (!hits.length) { sugBox.classList.add('hidden'); return; }
    hits.forEach(function (n) {
      var d = document.createElement('div');
      d.className = 'sug-item';
      d.textContent = n;
      var cat = catalogByName[n];
      if (cat) {
        var s = document.createElement('span');
        s.className = 'sug-cat';
        s.textContent = cat[0].category;
        d.appendChild(s);
      }
      d.onmousedown = function (ev) { ev.preventDefault(); selectCard(n); };
      sugBox.appendChild(d);
    });
    sugBox.classList.remove('hidden');
  }
  input.oninput = showSuggest;
  input.onfocus = showSuggest;
  input.onblur = function () { setTimeout(function () { sugBox.classList.add('hidden'); }, 150); };
  input.onkeydown = function (e) {
    if (e.key === 'Enter') {
      var kw = input.value.trim();
      if (cardNames[kw]) selectCard(kw);
      else {
        var hit = allNames.find(function (n) { return n.indexOf(kw) >= 0; });
        if (hit) selectCard(hit);
      }
    }
  };

  // 苏丹卡速查按钮
  var sq = document.getElementById('sultanQuick');
  SULTAN_TYPES.forEach(function (t) {
    GRADES.forEach(function (g) {
      var b = document.createElement('button');
      b.textContent = t + '·' + g;
      b.onclick = function () { selectCard(t + '（' + g + '）'); };
      sq.appendChild(b);
    });
  });

  /* ---------- 查询渲染 ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var STATUS_TEXT = { done: '已完成', available: '可做', locked: '锁定' };

  function usageRows(matches) {
    // 按 篇章->线路 分组排序：已添加线路在前
    matches.sort(function (a, b) {
      var aa = P.state().added.indexOf(a.rt.id) >= 0 ? 0 : 1;
      var bb = P.state().added.indexOf(b.rt.id) >= 0 ? 0 : 1;
      return aa - bb;
    });
    var frag = document.createDocumentFragment();
    matches.forEach(function (m) {
      var row = el('div', 'use-row');
      var head = el('div', 'use-head');
      head.appendChild(el('span', 'use-from', m.ch.title + ' · ' + m.rt.name));
      head.appendChild(el('span', 'use-event', m.st.name));
      // 状态
      var added = P.state().added.indexOf(m.rt.id) >= 0;
      if (added) {
        var st = P.stepStatus(P.stepById[m.st.id]);
        head.appendChild(el('span', 'use-status st-' + st, STATUS_TEXT[st]));
      } else {
        var add = el('span', 'use-status st-notadded', '未添加线路 ＋');
        add.title = '点击添加此线路';
        add.onclick = function () { P.addRoute(m.rt.id); renderResult(); };
        head.appendChild(add);
      }
      row.appendChild(head);
      var meta = el('div', 'use-meta');
      var s = m.slot;
      meta.appendChild(el('span', 'tag ' + (s.required ? 'tag-req' : 'tag-opt'), s.required ? '必需卡槽' : '可选卡槽'));
      if (s.consumed) meta.appendChild(el('span', 'tag tag-consume', '会消耗'));
      if (s.sultan) meta.appendChild(el('span', 'tag tag-sultan', '折卡渠道' + (s.maxGrade ? '（' + s.maxGrade + '及以下）' : '（品级不限/动态）')));
      if (s.note) meta.appendChild(el('span', 'use-note', s.note));
      row.appendChild(meta);
      if (m.st.trigger) row.appendChild(el('div', 'use-trigger', '触发：' + m.st.trigger));
      frag.appendChild(row);
    });
    return frag;
  }

  var currentQuery = null;

  function selectCard(name) {
    input.value = name;
    sugBox.classList.add('hidden');
    currentQuery = parseName(name);
    renderResult();
  }

  function renderResult() {
    var box = document.getElementById('cardResult');
    box.innerHTML = '';
    document.getElementById('cardEmpty').classList.add('hidden');
    if (!currentQuery) return;
    var base = currentQuery.base, grade = currentQuery.grade;
    var displayName = grade ? base + '（' + grade + '）' : base;

    // 标题
    var title = el('h2', 'card-title', displayName);
    box.appendChild(title);

    // 图鉴信息
    var catEntries = catalogByName[displayName] || catalogByName[base] || [];
    if (catEntries.length) {
      var info = el('div', 'card-info');
      catEntries.forEach(function (c) {
        var line = el('div', 'ci-row');
        var chips = el('span', 'ci-chips');
        chips.appendChild(el('span', 'tag tag-cat', c.category));
        (c.tags || []).forEach(function (t) { chips.appendChild(el('span', 'tag', t)); });
        line.appendChild(chips);
        info.appendChild(line);
        if (c.obtain) info.appendChild(el('div', 'ci-obtain', '获取：' + c.obtain));
        (c.uses || []).forEach(function (u) { info.appendChild(el('div', 'ci-use', '用途：' + u)); });
      });
      box.appendChild(info);
    }

    // 收集匹配槽位
    var matches = [];
    if (isSultan(base)) {
      (slotIndex[base] || []).forEach(function (m) {
        if (m.slot.sultan && gradeFits(m.slot.maxGrade, grade)) matches.push(m);
      });
    } else {
      matches = (slotIndex[base] || []).slice();
      // 去掉苏丹卡槽位里同名的干扰（非苏丹卡名不会撞上，防御性）
      matches = matches.filter(function (m) { return !m.slot.sultan || m.slot.card === base; });
    }

    // 需要保留：必需卡槽 且 事件未完成且未被排除
    var excl = P.state().excluded || [];
    var keep = matches.filter(function (m) {
      return m.slot.required && P.state().done.indexOf(m.st.id) < 0 && excl.indexOf(m.st.id) < 0;
    });
    // 可销/可用：可选卡槽（或必需但本就会消耗掉的，也列进去供参考）——按需求：可销=可选槽
    var spend = matches.filter(function (m) { return !m.slot.required; });

    // 需要保留区
    var secKeep = el('section', 'card-sec');
    var keepHead = el('h3', null, '需要保留（' + keep.length + '）');
    keepHead.appendChild(el('span', 'sec-sub', ' 这些未完成事件的必需卡槽点名要它——销掉/用掉之前先确认'));
    secKeep.appendChild(keepHead);
    if (keep.length) secKeep.appendChild(usageRows(keep));
    else secKeep.appendChild(el('div', 'sec-empty', '没有未完成的事件必需这张卡，可以放心使用。'));
    box.appendChild(secKeep);

    // 可销/可用区
    var secSpend = el('section', 'card-sec');
    var spendHead = el('h3', null, '可销 / 可使用（' + spend.length + '）');
    spendHead.appendChild(el('span', 'sec-sub', ' 这些事件的可选卡槽可以放入它（折卡/消耗/增益）'));
    secSpend.appendChild(spendHead);
    if (spend.length) secSpend.appendChild(usageRows(spend));
    else secSpend.appendChild(el('div', 'sec-empty', '没有找到可以放入它的事件。'));
    box.appendChild(secSpend);

    // 必需但已消耗类补充说明：required+consumed 的也提醒在可销区顶部？已在 keep 中展示，带"会消耗"标签。
  }

  window.CARDPAGE = { renderResult: renderResult };
})();
