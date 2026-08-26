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
const clickStep = (rid,name) => {
  const row = [...cardOf(rid).querySelectorAll('.step')].find(li=>{
    const sn = li.querySelector('.sname'); if (!sn) return false;
    return [...sn.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('') === name;
  });
  if (row) row.click();
  return !!row;
};
function clickAllAvailable(rid, guardMax){
  for (let g=0; g<(guardMax||30); g++){
    const avail = [...cardOf(rid).querySelectorAll('.step.available')];
    if (!avail.length) break;
    avail[0].click();
  }
}

/* ---- 玛希尔：完成《长期研究》自动加入权杖线/行尸线/支线 ---- */
P.addRoute('maxier_join');
clickAllAvailable('maxier_join');
check('入队线全部完成', P.state().done.filter(id=>id.startsWith('maxier_join')).length === 9);
check('自动加入生命权杖线', P.state().added.includes('maxier_zhang'));
check('自动加入行尸线', P.state().added.includes('maxier_shi'));
check('自动加入支线事件线', P.state().added.includes('maxier_other'));
check('toast 提示出现', !!doc.getElementById('toast') && doc.getElementById('toast').textContent.includes('自动加入'));
check('自动加入的卡默认半展开', P.state().viewMode['maxier_zhang'] === 'half');
check('行尸线天才的想法已解锁', P.stepStatus(P.stepById['maxier_shi_1']) === 'available');

// 重复完成不重复添加
const before = P.state().added.length;
// 撤销长期研究再完成一次
clickStep('maxier_join', '长期研究'); // undo
clickStep('maxier_join', '长期研究'); // redo —— 但此时行尸线天才的想法可能还锁着，长期研究应可用
check('无重复添加', P.state().added.length === before);

/* ---- 盖斯：收服盖斯(terminal) 同时完结入队线并加入爵位线 ---- */
P.addRoute('gaisi_join');
// 选择性点击（避免点到终结步骤以身试刀）
clickStep('gaisi_join','脱罪的希望');
clickStep('gaisi_join','盖斯异常失望');
clickStep('gaisi_join','诉冤的女人1');
clickStep('gaisi_join','诉冤的女人·2');
check('实地走访解锁（女人1/2或关系）', P.stepStatus(P.stepById['gaisi_join_7']) === 'available');
clickStep('gaisi_join','实地走访');
clickStep('gaisi_join','初步调查');
clickStep('gaisi_join','深入调查');
clickStep('gaisi_join','收服盖斯');
check('收服盖斯后自动加入爵位线', P.state().added.includes('gaisi_title'));
check('入队线自动完结', P.state().doneRoutes.includes('gaisi_join'));
check('爵位线首步已解锁', P.stepStatus(P.stepById['gaisi_title_1']) === 'available');

console.log(failures === 0 ? '\nALL FOLLOWUP TESTS PASSED' : '\n'+failures+' TESTS FAILED');
process.exit(failures?1:0);
