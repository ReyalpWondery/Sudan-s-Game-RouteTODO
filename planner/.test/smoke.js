const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dir = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(dir, '..', 'index.html'), 'utf-8');
const dataJs = fs.readFileSync(path.join(dir, 'data.js'), 'utf-8');
const appJs = fs.readFileSync(path.join(dir, 'app.js'), 'utf-8');

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const { window } = dom;

let failures = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failures++;
}

// 注入脚本
window.eval(dataJs);
window.eval(appJs);
const doc = window.document;

check('侧栏渲染出人物线章节', doc.querySelectorAll('#tabContent .chapter-block').length > 10);
check('空状态提示可见', !doc.getElementById('emptyHint').classList.contains('hidden'));

// 添加玛希尔篇·行尸线
const blocks = [...doc.querySelectorAll('#tabContent .chapter-block')];
const maxierBlk = blocks.find(b => b.querySelector('.name').textContent.includes('玛希尔'));
check('找到玛希尔篇', !!maxierBlk);
maxierBlk.classList.add('open');
const rows = [...maxierBlk.querySelectorAll('.route-row')];
const shiRow = rows.find(r => r.querySelector('.rname').textContent.includes('行尸线'));
shiRow.querySelector('.add-btn').click();

check('卡片已添加', doc.querySelectorAll('#cards .card').length === 1);
check('emptyHint 隐藏', doc.getElementById('emptyHint').classList.contains('hidden'));
check('新线路默认半展开', [...doc.querySelectorAll('#cards .card .icon-btn')].some(b=>b.textContent==='半展开'));

// 半展开只显示可做的：行尸线全部锁定，应只显示 footer 提示
check('半展开隐藏锁定步骤', doc.querySelectorAll('#cards .card .step:not(.half-foot)').length === 0);

// 切到全展开以便检查锁定状态
function expandFull(cardEl){
  const rid = cardEl.id;
  for (let i=0;i<4;i++){
    const btn = [...doc.getElementById(rid).querySelectorAll('.icon-btn')].find(b=>['半展开','已收起','全展开'].includes(b.textContent));
    if (btn.textContent === '全展开') break;
    btn.click(); // 每次点击后 DOM 重渲染，需重新查询按钮
  }
}
expandFull(doc.querySelector('#cards .card'));

// 行尸线第一步应锁定（需《长期研究》），且锁定步骤上有"＋添加"快捷按钮
let card = doc.querySelector('#cards .card');
let firstStep = card.querySelector('.step');
check('首步锁定', firstStep.classList.contains('locked'));
const qadd = firstStep.querySelector('.qadd');
check('锁定步骤带快捷添加按钮', !!qadd && qadd.textContent.includes('入队'));

// 点击锁定步骤不应变完成
firstStep.click();
check('锁定步骤点击无效', firstStep.classList.contains('locked'));

// 通过快捷按钮添加入队线
qadd.click();
check('快捷添加入队线后卡片=2', doc.querySelectorAll('#cards .card').length === 2);

// 找到入队线卡片，完成前两步，直至《长期研究》可用
const joinCard = [...doc.querySelectorAll('#cards .card')].find(c => c.querySelector('.cname').textContent.includes('入队'));
const joinSteps = [...joinCard.querySelectorAll('.step')];
check('入队线首步可做', joinSteps[0].classList.contains('available'));

// 依次点完入队线全部可用步骤（模拟链式解锁）
const findJoinCard = () => [...doc.querySelectorAll('#cards .card')].find(c => c.querySelector('.cname').textContent.includes('入队'));
for (let guard = 0; guard < 30; guard++) {
  const avail = [...findJoinCard().querySelectorAll('.step.available')];
  if (!avail.length) break;
  avail[0].click();
}
check('入队线全部完成', findJoinCard().querySelector('.prog span').textContent.startsWith('9/9'));

// 当前可做里应出现 行尸线·天才的想法
const nowItems = [...doc.querySelectorAll('#nowList .now-item')];
check('当前可做非空', nowItems.length > 0);
check('当前可做含天才的想法', nowItems.some(i => i.querySelector('.sname').textContent === '天才的想法'));

// 点击当前可做中的"天才的想法"完成
nowItems.find(i => i.querySelector('.sname').textContent === '天才的想法').click();
const shiCard = [...doc.querySelectorAll('#cards .card')].find(c => c.querySelector('.cname').textContent.includes('行尸'));
check('天才的想法已完成', [...shiCard.querySelectorAll('.step')][0].classList.contains('done'));
check('不洁的原料解锁', [...shiCard.querySelectorAll('.step')][1].classList.contains('available'));

// 撤销：再点一次 done 步骤
[...shiCard.querySelectorAll('.step')][0].click();
const shiCard2 = [...doc.querySelectorAll('#cards .card')].find(c => c.querySelector('.cname').textContent.includes('行尸'));
check('可撤销完成', [...shiCard2.querySelectorAll('.step')][0].classList.contains('available'));
check('撤销后后续重新锁定', [...shiCard2.querySelectorAll('.step')][1].classList.contains('locked'));

// localStorage 持久化
const saved = JSON.parse(window.localStorage.getItem('sultan_planner_v1'));
check('状态已持久化', saved && saved.added.length >= 2 && Array.isArray(saved.done));

// 顶部统计
check('顶部统计更新', doc.getElementById('topStats').textContent.includes('已添加 ' + window.PLANNER.state().added.length + ' 条线路'));

console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' TESTS FAILED');
process.exit(failures ? 1 : 0);
