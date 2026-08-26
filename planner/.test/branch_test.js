const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dir = path.join(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(dir,'..','index.html'),'utf-8'), { runScripts: 'outside-only', url: 'http://localhost/' });
const { window } = dom;
window.eval(fs.readFileSync(path.join(dir,'data.js'),'utf-8'));
window.eval(fs.readFileSync(path.join(dir,'app.js'),'utf-8'));
const doc = window.document;
const P = window.PLANNER;
let failures = 0;
const check = (n,c)=>{ console.log((c?'PASS':'FAIL')+'  '+n); if(!c) failures++; };
const cardOf = (rid) => doc.getElementById('card_'+rid);
const stepsOf = (rid) => [...cardOf(rid).querySelectorAll('.step')];
// 切到全展开（半展开只渲染可做子项，DOM 检查需要全展开）
function expandFull(rid){
  for (let i=0;i<4;i++){
    const btn = [...cardOf(rid).querySelectorAll('.icon-btn')].find(b=>['半展开','已收起','全展开'].includes(b.textContent));
    if (btn.textContent === '全展开') break;
    btn.click(); // 点击后 DOM 重渲染，需重新查询按钮
  }
}

/* ---- 1. 分歧选项自动打删除标 ---- */
// 齐亚德税务官线：税务官的请求1 → 严厉刑罚/仁慈的许诺 二择
const fed = P.DATA.chapters.find(c=>c.id==='faerdake_qiyade');
const qyRoute = fed.routes.find(r=>r.name.includes('税务官'));
const joinRoute = fed.routes.find(r=>r.name.includes('入队'));
// 请求1 的前置在入队线（修建暗渠/祈雨献祭），先添加并完成链
P.addRoute(joinRoute.id);
function clickStep(rid, name){
  const row = stepsOf(rid).find(li=>li.querySelector('.sname').textContent.includes(name));
  if (row) row.click();
  return row;
}
clickStep(joinRoute.id, '苏丹的捉弄');
clickStep(joinRoute.id, '兴修宫殿');
clickStep(joinRoute.id, '质子的请求');
clickStep(joinRoute.id, '修建暗渠'); // 选择修建暗渠后，祈雨献祭应被自动打删除标
const qx = joinRoute.steps.find(s=>s.name==='祈雨献祭');
check('分歧支线祈雨献祭自动打删除标', P.stepStatus(P.stepById[qx.id]) === 'excluded');
P.addRoute(qyRoute.id);
expandFull(qyRoute.id);
const qySteps = qyRoute.steps;
const req1 = qySteps.find(s=>s.name==='税务官的请求1');
// 请求1 的两个前置（修建暗渠/祈雨献祭）是二选一关系：一个完成、另一个被删除标，应解锁
check('请求1可用', P.stepStatus(P.stepById[req1.id]) === 'available');
clickStep(qyRoute.id, '税务官的请求1');
check('请求1完成', P.stepStatus(P.stepById[req1.id]) === 'done');
const strict = qySteps.find(s=>s.name==='严厉刑罚');
const mercy = qySteps.find(s=>s.name==='仁慈的许诺');
check('严厉刑罚可用', P.stepStatus(P.stepById[strict.id]) === 'available');
check('仁慈的许诺可用', P.stepStatus(P.stepById[mercy.id]) === 'available');
clickStep(qyRoute.id, '严厉刑罚');
check('选择严厉刑罚后完成', P.stepStatus(P.stepById[strict.id]) === 'done');
check('仁慈的许诺自动打删除标', P.stepStatus(P.stepById[mercy.id]) === 'excluded');
check('删除标样式类', stepsOf(qyRoute.id).find(li=>li.querySelector('.sname').textContent.includes('仁慈的许诺')).classList.contains('excluded'));
check('当前可做不含被排除事件', ![...doc.querySelectorAll('#nowList .now-item .sname')].some(e=>e.textContent==='仁慈的许诺'));
// 撤销删除标
stepsOf(qyRoute.id).find(li=>li.querySelector('.sname').textContent.includes('仁慈的许诺')).querySelector('.ex-btn').click();
check('↩恢复后不再是删除标', P.stepStatus(P.stepById[mercy.id]) === 'available');
// 进度文本含排除计数
clickStep(qyRoute.id, '仁慈的许诺');
// 此时 严厉刑罚 已 done，仁慈的许诺 也 done（用户两条都做过则都保留）

/* ---- 2. 终结事件自动打完结标 ---- */
// 法拉杰篇·背叛线：单步终结
const fj = P.DATA.chapters.find(c=>c.id==='falajie');
const betray = fj.routes.find(r=>r.name.includes('背叛'));
P.addRoute(betray.id);
check('背叛线一步终结标记数据', betray.steps[0].terminal === true);
clickStep(betray.id, betray.steps[0].name);
check('完成终结步骤后自动打完结标', P.state().doneRoutes.includes(betray.id));
check('卡片出现已完结徽标', !!cardOf(betray.id).querySelector('.rdone-badge'));
// 取消完结
cardOf(betray.id).querySelector('.icon-btn[title*="完结"]').click();
check('取消完结标', !P.state().doneRoutes.includes(betray.id));

/* ---- 3. 手动删除标级联 ---- */
const mx = P.DATA.chapters.find(c=>c.id==='maxier');
const shi = mx.routes.find(r=>r.id==='maxier_shi');
P.addRoute(shi.id);
expandFull(shi.id);
// 手动给 天才的想法 打删除标 → 后续全部级联排除
const tcxf = shi.steps[0];
const row0 = stepsOf(shi.id).find(li=>li.querySelector('.sname').textContent.includes('天才的想法'));
row0.querySelector('.ex-btn').click();
const allExcluded = shi.steps.every(s=>P.stepStatus(P.stepById[s.id])==='excluded');
check('删除标级联到全部后续子事件', allExcluded);
// 恢复
stepsOf(shi.id).find(li=>li.querySelector('.sname').textContent.includes('天才的想法')).querySelector('.ex-btn').click();
check('恢复删除标级联撤回', shi.steps.every(s=>P.stepStatus(P.stepById[s.id])!=='excluded'));

/* ---- 4. 移除线路重置进度 ---- */
const join = mx.routes.find(r=>r.id==='maxier_join');
P.addRoute(join.id);
clickStep(join.id, '项目投资');
check('完成一步后进度=1', P.state().done.filter(id=>id.startsWith('maxier_join')).length === 1);
window.confirm = ()=>true;
cardOf(join.id).querySelector('.icon-btn.remove').click();
check('移除后卡片消失', !doc.getElementById('card_'+join.id));
check('移除后步骤完成记录清空', P.state().done.filter(id=>id.startsWith('maxier_join')).length === 0);
P.addRoute(join.id);
check('重新添加后从零开始', cardOf(join.id).querySelector('.prog span').textContent.startsWith('0/'));

console.log(failures === 0 ? '\nALL BRANCH TESTS PASSED' : '\n'+failures+' TESTS FAILED');
process.exit(failures?1:0);
