/* 苏丹的游戏 · 线路规划器
 * 数据：window.GAME_DATA = { chapters:[...], achievements:{groups:[...]} }
 * 状态：localStorage { added:[routeId], done:[stepId], doneAchv:[itemId], collapsed:{routeId:bool} }
 */
(function () {
  'use strict';
  var DATA = window.GAME_DATA;
  var LS_KEY = 'sultan_planner_v1';

  /* ---------- 索引 ---------- */
  var routeById = {};      // routeId -> {chapter, route}
  var stepById = {};       // stepId -> {chapter, route, step}
  var stepsByName = {};    // stepName -> [{chapter, route, step}]
  DATA.chapters.forEach(function (ch) {
    ch.routes.forEach(function (rt) {
      routeById[rt.id] = { chapter: ch, route: rt };
      rt.steps.forEach(function (st, i) {
        st._idx = i + 1;
        var rec = { chapter: ch, route: rt, step: st };
        stepById[st.id] = rec;
        (stepsByName[st.name] = stepsByName[st.name] || []).push(rec);
      });
    });
  });

  var CAT_NAME = { character: '人物线', main: '主线', base: '基础篇' };

  /* ---------- 状态 ---------- */
  var state = { added: [], done: [], doneAchv: [], viewMode: {}, doneRoutes: [], achvOrder: {}, excluded: [], relaxed: [], everDone: [] };
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) {
      var s = JSON.parse(raw);
      if (Array.isArray(s.added)) state.added = s.added.filter(function (id) { return routeById[id]; });
      if (Array.isArray(s.done)) state.done = s.done.filter(function (id) { return stepById[id]; });
      if (Array.isArray(s.doneAchv)) state.doneAchv = s.doneAchv;
      if (s.viewMode) state.viewMode = s.viewMode;
      else if (s.collapsed) { // 旧版布尔值迁移：true->collapsed, false->full
        Object.keys(s.collapsed).forEach(function (rid) { state.viewMode[rid] = s.collapsed[rid] ? 'collapsed' : 'full'; });
      }
      if (Array.isArray(s.doneRoutes)) state.doneRoutes = s.doneRoutes.filter(function (id) { return routeById[id]; });
      if (s.achvOrder) state.achvOrder = s.achvOrder;
      if (Array.isArray(s.excluded)) state.excluded = s.excluded.filter(function (id) { return stepById[id]; });
      if (Array.isArray(s.relaxed)) state.relaxed = s.relaxed.filter(function (id) { return stepById[id]; });
      if (Array.isArray(s.everDone)) state.everDone = s.everDone;
    }
  } catch (e) { /* 损坏则重来 */ }

  function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

  /* ---------- 前置解析 ---------- */
  // 返回 {okSteps:[rec], missing:[{name, rec|null}], external:[name]}
  function resolvePrereqs(step, chapter) {
    var res = { okSteps: [], missing: [], external: [] };
    (step.prereqs || []).forEach(function (name) {
      var cands = stepsByName[name];
      if (!cands) { res.external.push(name); return; }
      // 同篇章优先
      var inCh = cands.filter(function (c) { return c.chapter.id === chapter.id; });
      var pool = inCh.length ? inCh : cands;
      // 任一候选完成即满足；因分歧被排除的候选（relaxed）也视为满足
      // （攻略中"完成A或B"被记为两个前置，未选的分支打了删除标，不应卡死线路）
      if (pool.some(function (c) {
        return state.done.indexOf(c.step.id) >= 0 || state.relaxed.indexOf(c.step.id) >= 0;
      })) {
        res.okSteps.push(pool[0]);
      } else {
        res.missing.push({ name: name, rec: pool[0] });
      }
    });
    return res;
  }

  function stepStatus(rec) {
    if (state.excluded.indexOf(rec.step.id) >= 0) return 'excluded';
    if (state.done.indexOf(rec.step.id) >= 0) return 'done';
    var r = resolvePrereqs(rec.step, rec.chapter);
    return r.missing.length === 0 ? 'available' : 'locked';
  }

  /* ---------- 操作 ---------- */
  function addRoute(routeId) {
    if (state.added.indexOf(routeId) < 0 && routeById[routeId]) {
      state.added.push(routeId);
      if (!state.viewMode[routeId]) state.viewMode[routeId] = 'half'; // 默认半展开：只显示现在能做的
      save(); render();
    }
  }
  // 移除线路：进度、删除标、完结标一并重置，重新添加后从零开始（"曾完成"历史标记保留）
  function removeRoute(routeId) {
    var i = state.added.indexOf(routeId);
    if (i >= 0) state.added.splice(i, 1);
    var ids = {};
    routeById[routeId].route.steps.forEach(function (s) { ids[s.id] = true; });
    state.done = state.done.filter(function (id) { return !ids[id]; });
    state.excluded = state.excluded.filter(function (id) { return !ids[id]; });
    state.relaxed = state.relaxed.filter(function (id) { return !ids[id]; });
    var dr = state.doneRoutes.indexOf(routeId);
    if (dr >= 0) state.doneRoutes.splice(dr, 1);
    delete state.viewMode[routeId];
    save(); render();
  }
  function isRepeatable(st) {
    return /可重复|可再次|重新寻思|重新触发|再次触发|反复触发|无限循环|自动重启/.test((st.desc || '') + (st.trigger || ''));
  }
  // 同一线路内，以 name 为前置的后续步骤（含传递）
  function descendantsOf(rt, stepName) {
    var out = [];
    var queue = [stepName];
    var seen = {};
    while (queue.length) {
      var nm = queue.shift();
      rt.steps.forEach(function (s) {
        if (seen[s.id]) return;
        if ((s.prereqs || []).indexOf(nm) >= 0) {
          seen[s.id] = true;
          out.push(s);
          queue.push(s.name);
        }
      });
    }
    return out;
  }
  // 打/撤删除标。排除时级联采用"所有前置都断了才排除"：还有其他可达路径（已完成的兄弟分支）的
  // 后续事件不会被误伤；撤回时恢复整棵子树。
  // relax=true 表示"分歧中未选的分支"——作为前置时视为满足；完结/手动排除不影响语义
  function setExcluded(stepId, on, relax) {
    var rec = stepById[stepId];
    if (!rec) return;
    var chainIds = {};
    chainIds[rec.step.id] = true;
    if (on) {
      var chainNames = {};
      chainNames[rec.step.name] = true;
      var changed = true;
      while (changed) {
        changed = false;
        rec.route.steps.forEach(function (s) {
          if (chainIds[s.id] || state.done.indexOf(s.id) >= 0) return;
          if (!s.prereqs || !s.prereqs.length) return;
          var allDead = s.prereqs.every(function (pn) { return chainNames[pn]; });
          if (allDead) { chainIds[s.id] = true; chainNames[s.name] = true; changed = true; }
        });
      }
    } else {
      descendantsOf(rec.route, rec.step.name).forEach(function (s) { chainIds[s.id] = true; });
    }
    rec.route.steps.forEach(function (s) {
      if (!chainIds[s.id]) return;
      if (state.done.indexOf(s.id) >= 0) return; // 已完成的不动
      var i = state.excluded.indexOf(s.id);
      if (on && i < 0) state.excluded.push(s.id);
      if (!on && i >= 0) state.excluded.splice(i, 1);
      var j = state.relaxed.indexOf(s.id);
      if (on && relax && j < 0) state.relaxed.push(s.id);
      if (!on && j >= 0) state.relaxed.splice(j, 1);
    });
  }
  // 分歧自动打标：完成某步骤后，同一线路内"同一个抉择点分出、且未被选择"的支线标为删除
  function autoExcludeBranches(rec) {
    var st = rec.step, rt = rec.route;
    if (!st.prereqs || !st.prereqs.length) return;
    if (isRepeatable(st)) return;
    // 公共前置（最后一个视为抉择点）
    var parentName = st.prereqs[st.prereqs.length - 1];
    var parent = null;
    rt.steps.forEach(function (s) { if (s.name === parentName) parent = s; });
    if (!parent || isRepeatable(parent)) return;
    // 父步骤得是抉择/单选性质，否则兄弟姐妹可能只是并行任务
    if (!/单选|抉择|选“|选项/.test((parent.desc || '') + (parent.trigger || ''))) return;
    var key = st.prereqs.slice().sort().join('|');
    rt.steps.forEach(function (y) {
      if (y.id === st.id) return;
      if (state.done.indexOf(y.id) >= 0 || state.excluded.indexOf(y.id) >= 0) return;
      if (!y.prereqs || !y.prereqs.length) return;
      if (isRepeatable(y)) return;
      if (y.prereqs.slice().sort().join('|') !== key) return;
      setExcluded(y.id, true, true);
    });
  }
  // 线路完结时：剩余未完成子事件不会再触发，全部打删除标（不视为前置已满足）
  function excludeUnfinishedInRoute(routeId) {
    routeById[routeId].route.steps.forEach(function (s) {
      if (state.done.indexOf(s.id) < 0 && state.excluded.indexOf(s.id) < 0) {
        state.excluded.push(s.id);
      }
    });
  }
  // 完成事件后：自动把因此被解锁的、尚未添加的后续线路加入 todo
  function autoAddFollowups(rec) {
    var addedNow = [];
    DATA.chapters.forEach(function (ch) {
      ch.routes.forEach(function (rt) {
        if (state.added.indexOf(rt.id) >= 0) return;
        var unlocked = rt.steps.some(function (s) {
          if (!s.prereqs || s.prereqs.indexOf(rec.step.name) < 0) return false;
          // 该步骤的其他前置也都已满足（完成，或因分歧被排除）
          return s.prereqs.every(function (pn) {
            if (pn === rec.step.name) return true;
            var cands = stepsByName[pn] || [];
            var inCh = cands.filter(function (c) { return c.chapter.id === ch.id; });
            var pool = inCh.length ? inCh : cands;
            return pool.some(function (c) {
              return state.done.indexOf(c.step.id) >= 0 || state.relaxed.indexOf(c.step.id) >= 0;
            });
          });
        });
        if (unlocked) {
          state.added.push(rt.id);
          if (!state.viewMode[rt.id]) state.viewMode[rt.id] = 'half';
          addedNow.push(ch.title + ' · ' + rt.name);
        }
      });
    });
    if (addedNow.length) showToast('已自动加入后续线路：' + addedNow.join('、'));
  }
  function showToast(text) {
    var t = document.getElementById('toast');
    if (!t) {
      t = el('div', null);
      t.id = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.className = 'toast show';
    t.onclick = function () { t.classList.remove('show'); };
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { t.classList.remove('show'); }, 5000);
  }
  function toggleStep(stepId) {
    var rec = stepById[stepId];
    if (!rec) return;
    var i = state.done.indexOf(stepId);
    if (i >= 0) {
      state.done.splice(i, 1); // 撤销的是当前存档的完成，"曾完成"历史标记保留
    } else {
      if (stepStatus(rec) !== 'available') return;
      state.done.push(stepId);
      if (state.everDone.indexOf(stepId) < 0) state.everDone.push(stepId); // 曾完成标记，跨存档保留
      // 完成分歧选项：未走的支线自动打删除标
      autoExcludeBranches(rec);
      // 完成终结事件：自动打线路完结标
      if (rec.step.terminal && state.doneRoutes.indexOf(rec.route.id) < 0) {
        state.doneRoutes.push(rec.route.id);
        state.viewMode[rec.route.id] = 'collapsed';
        excludeUnfinishedInRoute(rec.route.id);
      }
      // 自动加入被解锁的后续故事线
      autoAddFollowups(rec);
    }
    save(); render();
  }
  function toggleExcluded(stepId) {
    var on = state.excluded.indexOf(stepId) < 0;
    // 手动删除标视为"分歧/不会再触发"，作为前置时满足（relax）
    setExcluded(stepId, on, true);
    save(); render();
  }
  function toggleAchv(itemId) {
    var i = state.doneAchv.indexOf(itemId);
    if (i >= 0) state.doneAchv.splice(i, 1); else state.doneAchv.push(itemId);
    save(); render();
  }
  // 上移/下移已添加线路（只改顺序，不动完成记录）
  function moveRoute(routeId, dir) {
    var i = state.added.indexOf(routeId);
    var j = i + dir;
    if (i < 0 || j < 0 || j >= state.added.length) return;
    var t = state.added[i]; state.added[i] = state.added[j]; state.added[j] = t;
    save(); render();
  }
  // 整条线路的"完结标记"——与逐事件完成的存档状态无关，互不影响
  // 打完结标时剩余未完成子事件自动打删除标；取消完结标时一并恢复
  function toggleRouteDone(routeId) {
    var i = state.doneRoutes.indexOf(routeId);
    if (i >= 0) {
      state.doneRoutes.splice(i, 1);
      routeById[routeId].route.steps.forEach(function (s) {
        var x = state.excluded.indexOf(s.id);
        if (x >= 0 && state.done.indexOf(s.id) < 0) state.excluded.splice(x, 1);
        var y = state.relaxed.indexOf(s.id);
        if (y >= 0) state.relaxed.splice(y, 1);
      });
    } else {
      state.doneRoutes.push(routeId);
      state.viewMode[routeId] = 'collapsed';
      excludeUnfinishedInRoute(routeId);
    }
    save(); render();
  }
  // 成就条目自定义排序
  function moveAchv(groupId, itemId, dir) {
    var g = DATA.achievements.groups.find(function (x) { return x.id === groupId; });
    if (!g) return;
    var order = orderedAchvItems(g).map(function (it) { return it.id; });
    var i = order.indexOf(itemId), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    var t = order[i]; order[i] = order[j]; order[j] = t;
    state.achvOrder[groupId] = order;
    save(); render();
  }
  function orderedAchvItems(g) {
    var saved = state.achvOrder[g.id] || [];
    var byId = {};
    g.items.forEach(function (it) { byId[it.id] = it; });
    var out = [];
    saved.forEach(function (id) { if (byId[id]) { out.push(byId[id]); delete byId[id]; } });
    g.items.forEach(function (it) { if (byId[it.id]) out.push(it); });
    return out;
  }
  function addChapterRoutes(chapterId) {
    var ch = DATA.chapters.find(function (c) { return c.id === chapterId; });
    if (!ch) return 0;
    var n = 0;
    ch.routes.forEach(function (rt) {
      if (state.added.indexOf(rt.id) < 0) { state.added.push(rt.id); n++; }
    });
    if (n) { save(); render(); }
    return n;
  }

  /* ---------- 渲染：侧栏 ---------- */
  var curTab = 'character';
  var searchText = '';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function matchSearch() {
    var kw = searchText.trim();
    for (var i = 1; i < arguments.length; i++) {
      if (arguments[i] && arguments[i].indexOf(kw) >= 0) return true;
    }
    return !kw;
  }

  function renderSidebar() {
    var box = document.getElementById('tabContent');
    box.innerHTML = '';
    if (curTab === 'achievement') { renderAchvTab(box); return; }
    DATA.chapters.filter(function (ch) { return ch.category === curTab; }).forEach(function (ch) {
      // 搜索过滤
      var routes = ch.routes.filter(function (rt) {
        return matchSearch(0, ch.title, rt.name, rt.summary,
          rt.steps.map(function (s) { return s.name; }).join(''));
      });
      if (!routes.length) return;
      var blk = el('div', 'chapter-block' + (searchText.trim() ? ' open' : ''));
      var head = el('div', 'chapter-head');
      head.appendChild(el('span', 'name', ch.title));
      head.appendChild(el('span', 'chars', (ch.characters || []).join('、')));
      head.appendChild(el('span', 'arrow', '▸'));
      head.onclick = function () { blk.classList.toggle('open'); };
      blk.appendChild(head);
      var list = el('div', 'chapter-routes');
      routes.forEach(function (rt) {
        var row = el('div', 'route-row');
        var info = el('div', 'info');
        var nm = el('div', 'rname', rt.name);
        nm.appendChild(el('span', 'steps-n', rt.steps.length + ' 步'));
        info.appendChild(nm);
        if (rt.summary) info.appendChild(el('div', 'rsummary', rt.summary));
        row.appendChild(info);
        var added = state.added.indexOf(rt.id) >= 0;
        var btn = el('button', 'add-btn' + (added ? ' added' : ''), added ? '已添加' : '+ 添加');
        if (!added) btn.onclick = function () { addRoute(rt.id); };
        row.appendChild(btn);
        list.appendChild(row);
      });
      blk.appendChild(list);
      box.appendChild(blk);
    });
  }

  function renderAchvTab(box) {
    DATA.achievements.groups.forEach(function (g) {
      var kw = searchText.trim();
      var items = orderedAchvItems(g).filter(function (it) { return matchSearch(0, it.name, it.condition); });
      if (!items.length) return;
      var grp = el('div', 'achv-group');
      grp.appendChild(el('h3', null, g.name + '（' + g.items.length + '）'));
      items.forEach(function (it) {
        var done = state.doneAchv.indexOf(it.id) >= 0;
        var div = el('div', 'achv-item' + (done ? ' done' : ''));
        var head = el('div', 'ahead');
        var chk = el('button', 'mini-btn', done ? '✓ 已达成' : '标记达成');
        chk.onclick = function () { toggleAchv(it.id); };
        head.appendChild(chk);
        head.appendChild(el('span', 'aname', it.name));
        if (!kw) {
          var up = el('button', 'achv-move', '↑');
          up.title = '上移';
          up.onclick = function () { moveAchv(g.id, it.id, -1); };
          var dn = el('button', 'achv-move', '↓');
          dn.title = '下移';
          dn.onclick = function () { moveAchv(g.id, it.id, 1); };
          head.appendChild(up); head.appendChild(dn);
        }
        div.appendChild(head);
        div.appendChild(el('div', 'acond', it.condition));
        var refs = (it.chapterRefs || []).filter(function (cid) {
          return DATA.chapters.some(function (c) { return c.id === cid; });
        });
        if (refs.length) {
          var act = el('div', 'aactions');
          var btn = el('button', 'mini-btn', '一键添加相关线路（' + refs.length + ' 篇）');
          btn.onclick = function () {
            refs.forEach(addChapterRoutes);
          };
          act.appendChild(btn);
          refs.forEach(function (cid) {
            var ch = DATA.chapters.find(function (c) { return c.id === cid; });
            act.appendChild(el('span', 'ref-chip', ch.title));
          });
          div.appendChild(act);
        }
        grp.appendChild(div);
      });
      box.appendChild(grp);
    });
  }

  /* ---------- 渲染：当前可做 ---------- */
  function renderNow() {
    var list = document.getElementById('nowList');
    list.innerHTML = '';
    var avail = [];
    state.added.forEach(function (rid) {
      if (state.doneRoutes.indexOf(rid) >= 0) return; // 已打完结标记的线路不再参与
      var rr = routeById[rid];
      rr.route.steps.forEach(function (st) {
        var rec = stepById[st.id];
        if (stepStatus(rec) === 'available') avail.push(rec);
      });
    });
    document.getElementById('nowCount').textContent = avail.length || '';
    if (!avail.length) {
      list.appendChild(el('div', 'now-empty',
        state.added.length ? '没有可做的事了——去完成已解锁的事件，或添加新线路。' : '添加线路后，这里会汇总所有当前可做的事件。'));
      return;
    }
    avail.forEach(function (rec) {
      var row = el('div', 'now-item');
      row.title = rec.step.trigger || '';
      row.appendChild(el('span', 'from', rec.chapter.title + ' · ' + rec.route.name));
      row.appendChild(el('span', 'sname', rec.step.name));
      var tick = el('span', 'tick', '完成');
      tick.onclick = function (ev) { ev.stopPropagation(); toggleStep(rec.step.id); };
      row.appendChild(tick);
      row.onclick = function () { toggleStep(rec.step.id); };
      list.appendChild(row);
    });
  }

  /* ---------- 渲染：卡片 ---------- */
  function renderCards() {
    var box = document.getElementById('cards');
    box.innerHTML = '';
    document.getElementById('emptyHint').classList.toggle('hidden', state.added.length > 0);
    state.added.forEach(function (rid, ridx) {
      var rr = routeById[rid];
      var ch = rr.chapter, rt = rr.route;
      var doneN = rt.steps.filter(function (s) { return state.done.indexOf(s.id) >= 0; }).length;
      var exclN = rt.steps.filter(function (s) { return state.excluded.indexOf(s.id) >= 0 && state.done.indexOf(s.id) < 0; }).length;
      var effTotal = rt.steps.length - exclN;
      var routeDone = state.doneRoutes.indexOf(rid) >= 0;

      var card = el('div', 'card' + (routeDone ? ' route-done' : ''));
      card.id = 'card_' + rid;
      var head = el('div', 'card-head');
      head.appendChild(el('span', 'badge ' + ch.category, CAT_NAME[ch.category]));
      head.appendChild(el('span', 'cname', ch.title + ' · ' + rt.name));
      if (routeDone) head.appendChild(el('span', 'rdone-badge', '✓ 已完结'));
      var prog = el('div', 'prog');
      var bar = el('div', 'progress');
      var fill = el('i');
      fill.style.width = (effTotal ? Math.round(doneN / effTotal * 100) : 0) + '%';
      bar.appendChild(fill);
      prog.appendChild(bar);
      prog.appendChild(el('span', null, doneN + '/' + effTotal + (exclN ? '（排除' + exclN + '）' : '')));
      var upBtn = el('button', 'icon-btn reorder-btn', '↑');
      upBtn.title = '上移';
      upBtn.disabled = ridx === 0;
      upBtn.onclick = function () { moveRoute(rid, -1); };
      var dnBtn = el('button', 'icon-btn reorder-btn', '↓');
      dnBtn.title = '下移';
      dnBtn.disabled = ridx === state.added.length - 1;
      dnBtn.onclick = function () { moveRoute(rid, 1); };
      var doneBtn = el('button', 'icon-btn', routeDone ? '取消完结' : '完结标记');
      doneBtn.title = '整条线路的手动完结标记，与逐事件完成的进度互不影响';
      doneBtn.onclick = function () { toggleRouteDone(rid); };
      // 三态视图：half(只看可做) → full(全部) → collapsed(收起) → half
      var VMODE_TEXT = { half: '半展开', full: '全展开', collapsed: '已收起' };
      var VMODE_NEXT = { half: 'full', full: 'collapsed', collapsed: 'half' };
      var vmode = state.viewMode[rid] || 'half';
      var colBtn = el('button', 'icon-btn', VMODE_TEXT[vmode]);
      colBtn.title = '切换展开方式：半展开只显示当前可做的子项';
      colBtn.onclick = function () {
        state.viewMode[rid] = VMODE_NEXT[vmode]; save(); render();
      };
      var rmBtn = el('button', 'icon-btn remove', '移除');
      rmBtn.onclick = function () {
        if (confirm('移除「' + ch.title + ' · ' + rt.name + '」？该线路的完成记录、删除标与完结标将全部清空，重新添加后从零开始。')) removeRoute(rid);
      };
      prog.appendChild(upBtn); prog.appendChild(dnBtn); prog.appendChild(doneBtn);
      prog.appendChild(colBtn); prog.appendChild(rmBtn);
      head.appendChild(prog);
      card.appendChild(head);

      if (vmode !== 'collapsed') {
        if (rt.summary) card.appendChild(el('div', 'rsummary', rt.summary));
        var ul = el('ol', 'steps');
        var hiddenN = 0;
        rt.steps.forEach(function (st) {
          var rec = stepById[st.id];
          var status = stepStatus(rec);
          if (vmode === 'half' && status !== 'available') { hiddenN++; return; } // 半展开只显示现在能做的
          var li = el('li', 'step ' + status);
          li.appendChild(el('div', 'box'));
          var body = el('div', 'body');
          var nm = el('div', 'sname');
          nm.appendChild(el('span', 'num', st._idx + '.'));
          nm.appendChild(document.createTextNode(st.name));
          if (st.terminal) nm.appendChild(el('span', 'terminal-flag', '终点'));
          if (state.everDone.indexOf(st.id) >= 0 && status !== 'done') {
            nm.appendChild(el('span', 'everdone-flag', '曾完成'));
          }
          body.appendChild(nm);
          if (st.trigger) body.appendChild(el('div', 'trigger', '触发：' + st.trigger));
          if (st.desc) body.appendChild(el('div', 'desc', st.desc));
          var pr = resolvePrereqs(st, ch);
          if (pr.missing.length || pr.external.length || pr.okSteps.length) {
            var pqBox = el('div', 'prereqs');
            pr.okSteps.forEach(function (c) { pqBox.appendChild(el('span', 'pq ok', '✓ ' + c.step.name)); });
            pr.missing.forEach(function (m) {
              var chip = el('span', 'pq miss', '需先完成：' + m.name);
              if (m.rec && state.added.indexOf(m.rec.route.id) < 0) {
                var qa = el('span', 'qadd', '＋添加「' + m.rec.chapter.title + '·' + m.rec.route.name + '」');
                qa.onclick = function (ev) { ev.stopPropagation(); addRoute(m.rec.route.id); };
                chip.appendChild(qa);
              } else if (m.rec && m.rec.route.id !== rid) {
                chip.title = '在「' + m.rec.chapter.title + ' · ' + m.rec.route.name + '」中';
              }
              pqBox.appendChild(chip);
            });
            pr.external.forEach(function (name) {
              pqBox.appendChild(el('span', 'pq ext', '外部条件：' + name));
            });
            body.appendChild(pqBox);
          }
          li.appendChild(body);
          // 删除标按钮（已完成的不显示）
          if (status !== 'done') {
            var exBtn = el('button', 'ex-btn', status === 'excluded' ? '↩' : '✗');
            exBtn.title = status === 'excluded' ? '恢复此事件（及其后续子事件）' : '删除标：此事件不会再触发（后续子事件一并排除）';
            exBtn.onclick = function (ev) { ev.stopPropagation(); toggleExcluded(st.id); };
            li.appendChild(exBtn);
          }
          if (status === 'available' || status === 'done') {
            li.onclick = function () { toggleStep(st.id); };
          }
          ul.appendChild(li);
        });
        if (vmode === 'half') {
          var foot = el('li', 'step half-foot');
          foot.appendChild(el('div', 'body', hiddenN > 0
            ? '其余 ' + hiddenN + ' 项未显示（已完成/未解锁/已排除）——点右上角「全展开」查看'
            : '所有子项都是当前可做的'));
          ul.appendChild(foot);
        }
        card.appendChild(ul);
      }
      box.appendChild(card);
    });
  }

  /* ---------- 苏丹卡冲突警告 ----------
   * 统计已添加线路中"未完成事件"的必需苏丹卡卡槽：
   * 同一类型同一品级被超过 2 个事件必需（黄金品级超过 1 个）时给出警告。 */
  function sultanWarnings() {
    var counts = {};
    state.added.forEach(function (rid) {
      if (state.doneRoutes.indexOf(rid) >= 0) return;
      var rr = routeById[rid];
      rr.route.steps.forEach(function (st) {
        if (state.done.indexOf(st.id) >= 0) return;
        if (state.excluded.indexOf(st.id) >= 0) return;
        (st.slots || []).forEach(function (sl) {
          if (!sl.sultan || !sl.required || !sl.maxGrade) return;
          var key = sl.card + '|' + sl.maxGrade;
          var c = counts[key] = counts[key] || { type: sl.card, grade: sl.maxGrade, events: [] };
          if (!c.events.some(function (e) { return e.st.id === st.id; })) {
            c.events.push({ ch: rr.chapter, rt: rr.route, st: st });
          }
        });
      });
    });
    return Object.keys(counts).map(function (k) { return counts[k]; }).filter(function (c) {
      return c.events.length > (c.grade === '黄金' ? 1 : 2);
    });
  }

  function renderWarnings() {
    var panel = document.getElementById('warnPanel');
    panel.innerHTML = '';
    var warns = sultanWarnings();
    panel.classList.toggle('hidden', warns.length === 0);
    if (!warns.length) return;
    panel.appendChild(el('h2', null, '⚠ 苏丹卡冲突警告（' + warns.length + '）'));
    warns.forEach(function (w) {
      var div = el('div', 'warn-item');
      div.appendChild(el('span', 'wcard',
        '【' + w.grade + '·' + w.type + '】被 ' + w.events.length + ' 个未完成事件必需'));
      div.appendChild(el('span', 'wadvice',
        '（阈值：同卡 >2' + (w.grade === '黄金' ? '，黄金 >1' : '') + '）不建议同时做这些路线'));
      var ev = el('div', 'wevents');
      ev.textContent = w.events.map(function (e) {
        return e.ch.title + '·' + e.rt.name + '《' + e.st.name + '》';
      }).join('　');
      div.appendChild(ev);
      panel.appendChild(div);
    });
  }

  function renderTopStats() {
    var total = 0, doneN = 0;
    state.added.forEach(function (rid) {
      var rt = routeById[rid].route;
      total += rt.steps.length;
      rt.steps.forEach(function (s) { if (state.done.indexOf(s.id) >= 0) doneN++; });
    });
    document.getElementById('topStats').textContent =
      '已添加 ' + state.added.length + ' 条线路 · 完成 ' + doneN + '/' + total + ' 事件';
  }

  function render() {
    renderSidebar();
    renderWarnings();
    renderNow();
    renderCards();
    renderTopStats();
  }

  /* ---------- 事件绑定 ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    b.onclick = function () {
      document.querySelector('#tabs button.active').classList.remove('active');
      b.classList.add('active');
      curTab = b.getAttribute('data-tab');
      renderSidebar();
    };
  });
  document.getElementById('search').oninput = function (e) {
    searchText = e.target.value;
    renderSidebar();
  };
  document.getElementById('btnCollapse').onclick = function () {
    var anyOpen = state.added.some(function (rid) { return (state.viewMode[rid] || 'half') !== 'collapsed'; });
    state.added.forEach(function (rid) { state.viewMode[rid] = anyOpen ? 'collapsed' : 'full'; });
    this.textContent = anyOpen ? '展开全部' : '收起全部';
    save(); render();
  };
  document.getElementById('btnReset').onclick = function () {
    if (confirm('确定清空所有已添加线路与当前存档的完成记录？\n（成就标记和「曾完成」历史标记会保留，方便开新存档）')) {
      state = { added: [], done: [], doneAchv: state.doneAchv, viewMode: {}, doneRoutes: [], achvOrder: state.achvOrder, excluded: [], relaxed: [], everDone: state.everDone };
      save(); render();
    }
  };

  /* ---------- 对外 API（供销卡查询页使用） ---------- */
  window.PLANNER = {
    DATA: DATA,
    routeById: routeById,
    stepById: stepById,
    stepsByName: stepsByName,
    state: function () { return state; },
    addRoute: addRoute,
    stepStatus: stepStatus,
    refresh: render
  };

  render();
})();
