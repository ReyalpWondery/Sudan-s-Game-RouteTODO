const fs=require('fs'),path=require('path');
const {JSDOM}=require('jsdom');
const dir=path.join(__dirname,'..');

function run(label, actions){
  const dom=new JSDOM(fs.readFileSync(path.join(dir,'..','index.html'),'utf-8'),{runScripts:'outside-only',url:'http://localhost/'});
  const {window}=dom;
  window.eval(fs.readFileSync(path.join(dir,'data.js'),'utf-8'));
  window.eval(fs.readFileSync(path.join(dir,'app.js'),'utf-8'));
  const doc=window.document;
  const P=window.PLANNER;
  P.addRoute('alimu_join');
  const rowOf=(name)=>[...doc.getElementById('card_alimu_join').querySelectorAll('.step')].find(li=>{
    const sn=li.querySelector('.sname'); if(!sn) return false;
    return [...sn.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('')===name;
  });
  const click=(name)=>{const r=rowOf(name); if(!r){console.log('   (行不可见:',name,')');return;} r.click();};
  const exBtn=(name)=>{const r=rowOf(name); if(!r){console.log('   (行不可见:',name,')');return;} r.querySelector('.ex-btn').click();};
  const expandFull=()=>{
    for(let i=0;i<4;i++){
      const btn=[...doc.getElementById('card_alimu_join').querySelectorAll('.icon-btn')].find(b=>['半展开','已收起','全展开'].includes(b.textContent));
      if(btn.textContent==='全展开')break;
      btn.click();
    }
  };
  const st=(name)=>{const s=P.DATA.chapters.find(c=>c.id==='alimu').routes[0].steps.find(x=>x.name===name);return P.stepStatus(P.stepById[s.id]);};
  click('抓贼'); click('如何处置赫米尔'); click('阿里木到访');
  actions({click, exBtn, st, expandFull});
  console.log(label, '=> 夜盗:', st('夜盗'), '| 狗崽子丢失:', st('狗崽子丢失'), '| 先钱后货:', st('先钱后货'), '| 一手拿货:', st('一手拿货'));
}

run('顺序A: 先钱后货 -> 恢复并点一手拿货', ({click,exBtn,expandFull})=>{
  click('先钱后货');
  expandFull();
  exBtn('一手拿货'); // ↩恢复
  click('一手拿货');
});
run('顺序B: 一手拿货 -> 恢复并点先钱后货', ({click,exBtn,expandFull})=>{
  click('一手拿货');
  expandFull();
  exBtn('先钱后货');
  click('先钱后货');
});
run('顺序C: 只点先钱后货', ({click})=>{ click('先钱后货'); });
run('顺序D: 只点一手拿货', ({click})=>{ click('一手拿货'); });
