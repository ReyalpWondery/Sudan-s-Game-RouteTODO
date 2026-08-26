const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dir = path.join(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(dir,'index.html'),'utf-8'), { runScripts: 'outside-only', url: 'http://localhost/' });
const { window } = dom;
window.eval(fs.readFileSync(path.join(dir,'data.js'),'utf-8'));
window.eval(fs.readFileSync(path.join(dir,'app.js'),'utf-8'));
const doc = window.document;
const P = window.PLANNER;
let failures = 0;
const check = (n,c)=>{ console.log((c?'PASS':'FAIL')+'  '+n); if(!c) failures++; };
const cardOf = (rid) => doc.getElementById('card_'+rid);
const clickStep = (rid,name) => {
  const row = [...cardOf(rid).querySelectorAll('.step')].find(li=>{
    const sn = li.querySelector('.sname');
    if (!sn) return false;
    const txt = [...sn.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('');
    return txt === name;
  });
  if (row) row.click();
  return row;
};
const rowOf = (rid,name) => [...cardOf(rid).querySelectorAll('.step')].find(li=>{
  const sn = li.querySelector('.sname');
  if (!sn) return false;
  return [...sn.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('') === name;
});
const modeBtn = (rid) => [...cardOf(rid).querySelectorAll('.icon-btn')].find(b=>['半展开','已收起','全展开'].includes(b.textContent));

/* ---- 半展开三态 ---- */
P.addRoute('maxier_join');
check('默认半展开', modeBtn('maxier_join').textContent === '半展开');
let visible = [...cardOf('maxier_join').querySelectorAll('.step:not(.half-foot)')];
check('半展开只显示可做子项（仅项目投资）', visible.length === 1 && visible[0].textContent.includes('项目投资'));
check('半展开有提示行', !!cardOf('maxier_join').querySelector('.half-foot'));
modeBtn('maxier_join').click(); // -> full
check('切到全展开', modeBtn('maxier_join').textContent === '全展开');
check('全展开显示全部9步', cardOf('maxier_join').querySelectorAll('.step:not(.half-foot)').length === 9);
modeBtn('maxier_join').click(); // -> collapsed
check('切到收起', !cardOf('maxier_join').querySelector('.steps'));
modeBtn('maxier_join').click(); // -> half
check('循环回半展开', modeBtn('maxier_join').textContent === '半展开');

// 半展开下完成一步，新解锁的下一步自动出现
clickStep('maxier_join', '项目投资');
visible = [...cardOf('maxier_join').querySelectorAll('.step:not(.half-foot)')];
check('完成后新解锁子项出现', visible.length === 2 && visible.some(li=>li.textContent.includes('扩建天文台')) && visible.some(li=>li.textContent.includes('项目投资·二')));

/* ---- 曾完成标记（跨存档） ---- */
const projId = 'maxier_join_1';
check('完成事件写入 everDone', P.state().everDone.includes(projId));
// 撤销当前存档完成 → 曾完成标记仍在（done 步骤只在全展开显示，先切全展开）
modeBtn('maxier_join').click(); // half -> full
clickStep('maxier_join', '项目投资');
check('撤销后当前完成清空', !P.state().done.includes(projId));
check('曾完成标记保留', P.state().everDone.includes(projId));
const row = rowOf('maxier_join', '项目投资');
check('步骤显示曾完成徽标', !!row.querySelector('.everdone-flag'));

// 移除线路再添加：进度重置、曾完成保留
window.confirm = ()=>true;
cardOf('maxier_join').querySelector('.icon-btn.remove').click();
check('移除后进度清空', !P.state().done.includes(projId));
P.addRoute('maxier_join');
check('重加后进度为0', cardOf('maxier_join').querySelector('.prog span').textContent.startsWith('0/'));
modeBtn('maxier_join').click(); // -> full
const row2 = rowOf('maxier_join', '项目投资');
check('重加后曾完成徽标仍在', !!row2.querySelector('.everdone-flag'));

// 重置全部：当前存档清空、曾完成与成就标记保留
P.state().doneAchv.push('a1001_1');
P.addRoute('maxier_shi');
clickStep('maxier_shi', '天才的想法'); // 锁定，不应生效（需要长期研究）
doc.getElementById('btnReset').click();
check('重置后线路清空', P.state().added.length === 0);
check('重置后当前完成清空', P.state().done.length === 0);
check('重置后曾完成保留', P.state().everDone.includes(projId));
check('重置后成就标记保留', P.state().doneAchv.includes('a1001_1'));

console.log(failures === 0 ? '\nALL SAVESTATE TESTS PASSED' : '\n'+failures+' TESTS FAILED');
process.exit(failures?1:0);
