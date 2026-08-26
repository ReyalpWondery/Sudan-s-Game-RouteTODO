const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dir = path.join(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(dir,'index.html'),'utf-8'), { runScripts: 'outside-only', url: 'http://localhost/' });
const { window } = dom;
window.eval(fs.readFileSync(path.join(dir,'data.js'),'utf-8'));
window.eval(fs.readFileSync(path.join(dir,'app.js'),'utf-8'));
const doc = window.document;
let failures = 0;
const check = (n,c)=>{ console.log((c?'PASS':'FAIL')+'  '+n); if(!c) failures++; };

// 切到成就 tab
[...doc.querySelectorAll('#tabs button')].find(b=>b.dataset.tab==='achievement').click();
const groups = doc.querySelectorAll('.achv-group');
check('成就三组渲染', groups.length === 3);
const items = doc.querySelectorAll('.achv-item');
check('成就条目 > 200', items.length > 200);

// 找"遥远乐土"并一键添加相关线路
const target = [...items].find(i => i.querySelector('.aname').textContent === '遥远乐土');
check('找到成就:遥远乐土', !!target);
const addBtn = target.querySelector('.aactions .mini-btn');
check('有一键添加按钮', !!addBtn && addBtn.textContent.includes('一键添加'));
addBtn.click();
check('一键添加后卡片>0', doc.querySelectorAll('#cards .card').length > 0);
const names = [...doc.querySelectorAll('#cards .card .cname')].map(e=>e.textContent).join('|');
check('添加了逃亡篇线路', names.includes('逃亡'));

// 标记达成
target.querySelector('.ahead .mini-btn').click();
const target2 = [...doc.querySelectorAll('.achv-item')].find(i => i.querySelector('.aname').textContent === '遥远乐土');
check('成就标记达成', target2.classList.contains('done'));

// 搜索过滤
const search = doc.getElementById('search');
search.value = '屠龙';
search.dispatchEvent(new window.Event('input'));
check('成就搜索过滤生效', [...doc.querySelectorAll('.achv-item')].every(i =>
  (i.querySelector('.aname').textContent + i.querySelector('.acond').textContent).includes('屠龙')));

console.log(failures === 0 ? '\nALL ACHV TESTS PASSED' : '\n'+failures+' FAILED');
process.exit(failures?1:0);
