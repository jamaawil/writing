// Verify the writer pages against the repository's original builder using the
// same content. All baseline output goes to a disposable, isolated directory.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const baseline=fs.mkdtempSync(path.join(os.tmpdir(),'awil-style-baseline-'));
try {
  execFileSync('git',['diff','--exit-code','HEAD','--','static/css/style.css','static/js/main.js','static/js/comments.js','static/js/footnotes.js','static/js/zettel-graph.js'],{cwd:root});
  let source=execFileSync('git',['show','HEAD:build.js'],{cwd:root,encoding:'utf8'});
  const marker='const OUT = path.join(ROOT, "public");';
  assert.ok(source.includes(marker),'Original builder output declaration changed');
  source=source.replace(marker,'const OUT = '+JSON.stringify(baseline)+';');
  const run=vm.runInThisContext('(function(require,__dirname,module,exports){'+source+'\n})',{filename:path.join(root,'baseline-build.js')});
  run(require,root,{exports:{}},{});
  let compared=0;const changed=[];
  function visit(directory){
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      const file=path.join(directory,entry.name),relative=path.relative(baseline,file);
      if(relative==='zettel' || relative.startsWith('zettel'+path.sep))continue;
      if(entry.isDirectory()){visit(file);continue;}
      if(!file.endsWith('.html'))continue;
      const current=path.join(root,'public',relative);compared++;
      if(!fs.existsSync(current)||!fs.readFileSync(file).equals(fs.readFileSync(current)))changed.push(relative);
      const html=fs.readFileSync(current,'utf8');
      assert.ok(!html.includes('/css/research.css')&&!html.includes('/js/research.js')&&!html.includes('/js/research-graph.js'),'Research resources leaked into '+relative);
    }
  }
  visit(baseline);
  if(changed.length){const a=fs.readFileSync(path.join(baseline,changed[0]),'utf8'),b=fs.readFileSync(path.join(root,'public',changed[0]),'utf8');let i=0;while(a[i]===b[i]&&i<a.length)i++;console.error({firstChangedPage:changed[0],position:i,original:a.slice(i-60,i+100),current:b.slice(i-60,i+100)});}
  assert.equal(changed.length,0,'Writer pages changed outside Zettel');
  const zettel=fs.readFileSync(path.join(root,'public/zettel/index.html'),'utf8');
  assert.ok(zettel.includes('/css/research.css')&&zettel.includes('class="research-site"'));
  const writer=fs.readFileSync(path.join(baseline,'index.html'),'utf8');
  const profile=html=>html.slice(html.indexOf('<div class="aside-top">'),html.indexOf('<nav class="aside-nav">'));
  assert.equal(profile(zettel),profile(writer),'Zettel profile differs from the writer site');
  const nav=html=>html.slice(html.indexOf('<nav class="aside-nav">'),html.indexOf('</nav>',html.indexOf('<nav class="aside-nav">'))).replace(/ class="active"/g,'');
  assert.equal(nav(zettel),nav(writer),'Zettel omits writer navigation');
  const css=fs.readFileSync(path.join(root,'static/css/research.css'),'utf8');
  assert.doesNotMatch(css,/\.research-site[^{}]*\.(?:aside-top|pfp|aside-nav|bio|email-link|title-block|club-button)\b/,'Research CSS overrides the writer profile');

  const report={checkedAt:new Date().toISOString(),writerPagesCompared:compared,changedWriterPages:changed.length,originalStylesAndScripts:'unchanged',researchAssets:'loaded only on Zettel pages',zettelProfile:'original portrait, biography, email, navigation, and inherited writer styles'};
  fs.writeFileSync(path.join(root,'.research/style-verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {fs.rmSync(baseline,{recursive:true,force:true});}
