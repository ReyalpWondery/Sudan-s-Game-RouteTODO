const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dir = path.join(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(dir,'index.html'),'utf-8'), { runScripts: 'outside-only', url: 'http://localhost/' });
const { window } = dom;
window.eval(fs.readFileSync(path.join(dir,'data.js'),'utf-8'));
window.eval(fs.readFileSync(path.join(dir,'app.js'),'utf-8'));
window.eval(fs.readFileSync(path.join(dir,'cardpage.js'),'utf-8'));
const doc = window.document;
let failures = 0;
const check = (n,c)=>{ console.log((c?'PASS':'FAIL')+'  '+n); if(!c) failures++; };

/* ---- 销卡查询页 ---- */
// 切到销卡查询视图
[...doc.querySelectorAll('#viewNav button')].find(b=>b.dataset.view==='cards').click();
check('销卡查询页显示', !doc.getElementById('cardPage').classList.contains('hidden'));
check('规划页隐藏', doc.getElementById('layout').classList.contains('hidden'));

// 苏丹卡速查按钮 16 个
check('苏丹卡速查16键', doc.querySelectorAll('#sultanQuick button').length === 16);

// 查询 奢靡（青铜）
[...doc.querySelectorAll('#sultanQuick button')].find(b=>b.textContent==='奢靡·青铜').click();
const res = doc.getElementById('cardResult');
check('结果标题正确', res.querySelector('.card-title').textContent.includes('奢靡'));
const keepSec = res.querySelectorAll('.card-sec')[0];
const spendSec = res.querySelectorAll('.card-sec')[1];
check('有可销列表', spendSec.querySelectorAll('.use-row').length > 3);
check('折卡渠道标签存在', spendSec.querySelectorAll('.tag-sultan').length > 0);

// 查询具体卡：星空之镜
const input = doc.getElementById('cardSearch');
input.value = '星空之镜';
input.dispatchEvent(new window.Event('input'));
const sug = [...doc.querySelectorAll('.sug-item')].find(d=>d.textContent.includes('星空之镜'));
check('搜索建议出现', !!sug);
sug.dispatchEvent(new window.MouseEvent('mousedown', {bubbles:true}));
const res2 = doc.getElementById('cardResult');
check('星空之镜图鉴信息', res2.querySelector('.card-info') && res2.querySelector('.card-info').textContent.includes('玛希尔'));
const keepRows = res2.querySelectorAll('.card-sec')[0].querySelectorAll('.use-row');
check('星空之镜有需要保留事件(天文台必需)', keepRows.length >= 2);
check('保留区有必需卡槽标签', res2.querySelectorAll('.card-sec')[0].querySelectorAll('.tag-req').length >= 1);

// 查询角色卡：玛希尔
input.value = '玛希尔';
input.dispatchEvent(new window.Event('input'));
const sug2 = [...doc.querySelectorAll('.sug-item')].find(d=>d.firstChild.textContent==='玛希尔');
check('角色卡建议出现', !!sug2);
sug2.dispatchEvent(new window.MouseEvent('mousedown', {bubbles:true}));
const res3 = doc.getElementById('cardResult');
check('玛希尔必需事件很多', res3.querySelectorAll('.card-sec')[0].querySelectorAll('.use-row').length >= 5);

/* ---- 线路重排序 + 完结标记 ---- */
[...doc.querySelectorAll('#viewNav button')].find(b=>b.dataset.view==='planner').click();
check('切回规划页', !doc.getElementById('layout').classList.contains('hidden'));

// 添加线路（自动按篇章类别切侧栏 tab）
function addRouteByName(chapterKw, routeKw, category){
  if (category) [...doc.querySelectorAll('#tabs button')].find(b=>b.dataset.tab===category).click();
  const blk = [...doc.querySelectorAll('#tabContent .chapter-block')].find(b=>b.querySelector('.name').textContent.includes(chapterKw));
  blk.classList.add('open');
  const row = [...blk.querySelectorAll('.route-row')].find(r=>r.querySelector('.rname').textContent.includes(routeKw));
  const btn = row.querySelector('.add-btn');
  if (!btn.disabled && btn.textContent.includes('添加')) btn.click();
}
addRouteByName('玛希尔','行尸线');
addRouteByName('玛希尔','入队');
check('添加2张卡片', doc.querySelectorAll('#cards .card').length === 2);

// 重排序：第二张上移
let names = () => [...doc.querySelectorAll('#cards .card .cname')].map(e=>e.textContent);
const before = names();
[...doc.querySelectorAll('#cards .card')[1].querySelectorAll('.reorder-btn')][0].click();
const after = names();
check('上移生效', before[0]===after[1] && before[1]===after[0]);

// 完结标记
doc.querySelectorAll('#cards .card')[0].querySelector('.icon-btn[title*="完结"]').click();
const card0 = doc.querySelectorAll('#cards .card')[0];
check('完结标记样式', card0.classList.contains('route-done'));
check('完结徽标', !!card0.querySelector('.rdone-badge'));
check('完结后自动收起', !card0.querySelector('.steps'));
// 完结标记不影响步骤存档进度
const saved1 = JSON.parse(window.localStorage.getItem('sultan_planner_v1'));
check('完结标记不动步骤存档', saved1.done.length === 0 && saved1.doneRoutes.length === 1);
// 当前可做不含已完结线路
check('当前可做排除完结线路', ![...doc.querySelectorAll('#nowList .now-item .from')].some(e=>e.textContent.includes('行尸')));
// 取消完结恢复
doc.querySelectorAll('#cards .card')[0].querySelector('.icon-btn[title*="完结"]').click();
check('取消完结恢复', !doc.querySelectorAll('#cards .card')[0].classList.contains('route-done'));

/* ---- 苏丹卡冲突警告 ---- */
// 初始无警告（这两条线的必需苏丹卡不超限）
check('无冲突时警告隐藏', doc.getElementById('warnPanel').classList.contains('hidden'));
// 阈值：同一卡（类型+品级）必需处 >2 触发；黄金卡 >1 即触发
const DATA = window.GAME_DATA;
const demand = {};
DATA.chapters.forEach(ch=>ch.routes.forEach(rt=>rt.steps.forEach(st=>{
  (st.slots||[]).forEach(sl=>{
    if(sl.sultan && sl.required && sl.maxGrade){
      const k = sl.card+'|'+sl.maxGrade;
      (demand[k]=demand[k]||[]).push({rt, st, ch});
    }
  });
})));
// 用 PLANNER API 强制构造场景
function addRoutesOf(combo, n){
  const rids = [...new Set(combo[1].map(x=>x.rt.id))].slice(0,n);
  rids.forEach(rid=>window.PLANNER.addRoute(rid));
}
// 场景1：黄金卡 2 处必需即应警告（阈值 >1）
const hotGold = Object.entries(demand).find(([k,v])=>k.includes('|黄金') && v.length>=2);
check('数据中存在黄金卡组合', !!hotGold);
if (hotGold){
  addRoutesOf(hotGold, 2);
  const wp = doc.getElementById('warnPanel');
  check('黄金卡>1处即警告', !wp.classList.contains('hidden') && wp.textContent.includes('黄金·'+hotGold[0].split('|')[0]));
  check('警告含建议语', wp.textContent.includes('不建议同时做这些路线'));
}
// 场景2：非黄金卡 2 处不应警告，3 处才警告
// 挑选 3 个事件分属 3 条不同线路的组合，且前 2 条线路的其他必需苏丹卡需求也不超限
function routeSultanDemand(rid){
  const rec = window.PLANNER.routeById[rid];
  const d = {};
  rec.route.steps.forEach(st=>(st.slots||[]).forEach(sl=>{
    if(sl.sultan&&sl.required&&sl.maxGrade){ const k=sl.card+'|'+sl.maxGrade; d[k]=(d[k]||0)+1; }
  }));
  return d;
}
const GOLD='|黄金';
function overLimit(counts){
  return Object.entries(counts).some(([k,n])=> n > (k.includes(GOLD)?1:2));
}
let scenario2 = null;
for (const [k,v] of Object.entries(demand)){
  if (k.includes(GOLD) || v.length<3) continue;
  // 每个 key 的事件按线路去重
  const byRoute = {};
  v.forEach(x=>{ (byRoute[x.rt.id]=byRoute[x.rt.id]||[]).push(x.st.id); });
  const rids = Object.keys(byRoute);
  if (rids.length < 3) continue;
  // 前2条线路合计该key恰好≤2，且总需求无超限
  const c2 = {};
  rids.slice(0,2).forEach(rid=>{
    const d = routeSultanDemand(rid);
    Object.entries(d).forEach(([kk,n])=>{ c2[kk]=(c2[kk]||0)+n; });
  });
  if ((c2[k]||0) > 2 || overLimit(c2)) continue;
  scenario2 = { key:k, rids:rids.slice(0,3) };
  break;
}
check('找到干净的三线路组合', !!scenario2);
if (scenario2){
  // 先清掉黄金场景影响：重置
  window.confirm = ()=>true;
  doc.getElementById('btnReset').click();
  check('重置后警告隐藏', doc.getElementById('warnPanel').classList.contains('hidden'));
  scenario2.rids.slice(0,2).forEach(rid=>window.PLANNER.addRoute(rid));
  check('普通卡2处不警告', doc.getElementById('warnPanel').classList.contains('hidden'));
  window.PLANNER.addRoute(scenario2.rids[2]);
  const wp2 = doc.getElementById('warnPanel');
  check('普通卡>2处才警告', !wp2.classList.contains('hidden') && wp2.textContent.includes(scenario2.key.split('|')[0]));
}

/* ---- 成就重排序 ---- */
[...doc.querySelectorAll('#tabs button')].find(b=>b.dataset.tab==='achievement').click();
const itemNames = () => [...doc.querySelector('.achv-group').querySelectorAll('.achv-item .aname')].map(e=>e.textContent);
const b4 = itemNames();
const moves = doc.querySelectorAll('.achv-group .achv-item')[1].querySelectorAll('.achv-move');
check('成就有排序按钮', moves.length === 2);
moves[0].click(); // 第二个上移
const af = itemNames();
check('成就上移生效', b4[0]===af[1] && b4[1]===af[0]);
const saved2 = JSON.parse(window.localStorage.getItem('sultan_planner_v1'));
check('成就排序持久化', saved2.achvOrder && Object.keys(saved2.achvOrder).length > 0);

console.log(failures === 0 ? '\nALL FEATURE TESTS PASSED' : '\n'+failures+' TESTS FAILED');
process.exit(failures?1:0);
