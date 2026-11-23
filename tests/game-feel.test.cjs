const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launch, copy, timestamp, html } = require('./harness.cjs');
const fixture = () => ({
  collections:[{id:'a',name:'Проекты',createdAt:timestamp},{id:'b',name:'Языки',createdAt:timestamp}],
  trophies:[
    {id:'p',title:'Платиновая победа',description:'Всё',rarity:'platinum',collectionId:'a',createdAt:timestamp,earnedAt:null},
    {id:'x',title:'Первая цель',description:'Начало',rarity:'bronze',collectionId:'a',createdAt:timestamp,earnedAt:null},
    {id:'y',title:'Вторая цель',description:'Продолжение',rarity:'silver',collectionId:'a',createdAt:timestamp,earnedAt:null},
    {id:'z',title:'Третья цель',description:'Финал',rarity:'gold',collectionId:'a',createdAt:timestamp,earnedAt:null}
  ],selectedCollection:'a',filter:'all'
});
const byId=(app,id)=>app.data().trophies.find(t=>t.id===id);
const earn=async(app,id,options={})=>{await app.click('trophyGrid','earn',id,options);await flush();};
const trusted={isTrusted:true};
const soundStorage=data=>({value:JSON.stringify(data),preferences:JSON.stringify({soundEnabled:true})});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('startup and migration are silent even with enabled sound and newly derived platinum', () => {
  const data=fixture();for(const t of data.trophies)if(t.id!=='p')t.earnedAt=timestamp;
  const app=launch(undefined,soundStorage(data),{audio:true});
  assert.ok(byId(app,'p').earnedAt);assert.equal(app.$('awardFeedback').hidden,true);assert.equal(app.$('awardFeedback').innerHTML,'');
  assert.equal(app.audio.contexts.length,0);assert.equal(app.audio.oscillators.length,0);assert.equal(app.$('soundToggle').getAttribute('aria-checked'),'true');
  const again=launch(undefined,app.storage,{audio:true});assert.equal(again.audio.contexts.length,0);assert.equal(again.$('awardFeedback').hidden,true);
});

test('bronze/silver/gold notifications contain correct title, rarity and icon and expire',async()=>{
  for(const [id,label,icon] of [['x','Бронза','●'],['y','Серебро','◇'],['z','Золото','◆']]){
    const app=launch(fixture());await earn(app,id);assert.equal(app.$('awardFeedback').hidden,false);
    assert.ok(app.$('awardFeedback').innerHTML.includes(label));assert.ok(app.$('awardFeedback').innerHTML.includes(icon));
    assert.ok(app.$('awardFeedback').innerHTML.includes(byId(app,id).title));assert.doesNotMatch(app.$('awardFeedback').innerHTML,/class="award-card platinum-celebration/);
    app.advance(3499);assert.equal(app.$('awardFeedback').hidden,false);app.advance(1);assert.equal(app.$('awardFeedback').hidden,true);
  }
});

test('notifications are a noninteractive overlay; controls work while an award is visible',async()=>{
  assert.match(html,/\.award-feedback\s*\{[^}]*pointer-events:\s*none/);
  const app=launch(fixture());await earn(app,'x');await app.click('filters','filter','gold');
  assert.equal(app.data().filter,'gold');assert.equal(app.$('awardFeedback').hidden,false);assert.equal(app.$('visibleCount').textContent,'1 трофей');
  await app.$('historyBtn').click();assert.equal(app.$('historyScreen').hidden,false);assert.equal(app.$('awardFeedback').hidden,false);
});

test('rapid acquisitions queue ordinary trophies followed by a distinct automatic platinum celebration',async()=>{
  const app=launch(fixture());await earn(app,'x');await earn(app,'y');await earn(app,'z');
  assert.match(app.$('awardFeedback').innerHTML,/Первая цель/);app.advance(3500);assert.match(app.$('awardFeedback').innerHTML,/Вторая цель/);
  app.advance(3500);assert.match(app.$('awardFeedback').innerHTML,/Третья цель/);app.advance(3500);
  assert.match(app.$('awardFeedback').innerHTML,/platinum-celebration/);assert.match(app.$('awardFeedback').innerHTML,/Платиновая победа/);assert.match(app.$('awardFeedback').innerHTML,/Коллекция завершена/);
  app.advance(4999);assert.equal(app.$('awardFeedback').hidden,false);app.advance(1);assert.equal(app.$('awardFeedback').hidden,true);
});

test('OS reduced-motion disables all trophy animation and transitions while retaining static award content',async()=>{
  assert.match(html,/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^\n]*animation:\s*none\s*!important;[^\n]*transition:\s*none\s*!important/);
  const app=launch(fixture());await earn(app,'x');assert.match(app.$('awardFeedback').innerHTML,/Первая цель/);
});

test('undo removes active/queued invalid awards and does not emit a new acquisition',async()=>{
  const app=launch(fixture());await earn(app,'x');await earn(app,'y');await earn(app,'z');await earn(app,'z');
  assert.equal(byId(app,'p').earnedAt,null);assert.equal(app.$('awardFeedback').hidden,false);
  app.advance(3500);assert.match(app.$('awardFeedback').innerHTML,/Вторая цель/);app.advance(3500);assert.equal(app.$('awardFeedback').hidden,true);
  await earn(app,'x');assert.equal(app.$('awardFeedback').hidden,true);
});

test('re-earning generates a fresh award and a single current history item with the new date',async()=>{
  const app=launch(fixture());await earn(app,'x');await earn(app,'x');assert.equal(app.$('awardFeedback').hidden,true);
  app.time('2026-11-24T12:00:00.000Z');await earn(app,'x');assert.match(app.$('awardFeedback').innerHTML,/Первая цель/);
  await app.$('historyBtn').click();assert.equal((app.$('historyList').innerHTML.match(/<article/g)||[]).length,1);
  assert.match(app.$('historyList').innerHTML,/datetime="2026-11-24T12:00:00.000Z"/);
});

test('editing, moving, reordering, filtering and viewing an already earned trophy do not repeat effects',async()=>{
  const app=launch(fixture());await earn(app,'x');app.advance(3500);
  await app.click('trophyGrid','edit','x');app.fields('trophyForm',{title:'Переименован',collection:'b'});await app.$('trophyForm').emit('submit');
  await app.open('b');await app.click('trophyGrid','up','x');await app.click('filters','filter','bronze');await app.$('historyBtn').click();await app.$('historyBackBtn').click();
  assert.equal(app.$('awardFeedback').hidden,true);assert.equal(app.$('awardFeedback').innerHTML,'');
});

test('failure to persist an acquisition leaves the notification and sound silent',async()=>{
  const app=launch(undefined,soundStorage(fixture()),{audio:true});app.storage.failWrite=true;await earn(app,'x',trusted);
  assert.equal(byId(app,'x').earnedAt,null);assert.equal(app.$('awardFeedback').hidden,true);assert.equal(app.audio.contexts.length,0);
});

test('v1 and v2 imports are silent, clear pending effects, and leave sound preference unchanged',async()=>{
  const app=launch(undefined,soundStorage(fixture()),{audio:true});await earn(app,'x',trusted);assert.equal(app.audio.oscillators.length,2);
  const complete=fixture();for(const t of complete.trophies)t.earnedAt=timestamp;
  await app.importFile({app:'NTrophia',version:1,data:complete});app.advance(20000);
  assert.equal(app.$('awardFeedback').hidden,true);assert.equal(app.audio.contexts.length,1);assert.equal(app.audio.oscillators.length,2);
  assert.equal(app.$('soundToggle').getAttribute('aria-checked'),'true');
  await app.$('exportBtn').click();const json=await app.blobs.get(app.downloads[0].href).text();const before=app.storage.value;
  await app.importFile(json);assert.equal(app.storage.value,before);assert.equal(app.audio.oscillators.length,2);assert.equal(app.$('awardFeedback').hidden,true);
});

test('history lists current trophies newest first with rarity, collection and exact dates; return preserves context',async()=>{
  const app=launch(fixture());await earn(app,'x');app.time('2026-11-24T12:00:00.000Z');await earn(app,'y');
  const before=app.storage.value;await app.$('historyBtn').click();assert.equal(app.$('homeScreen').hidden,true);assert.equal(app.$('collectionScreen').hidden,true);assert.equal(app.$('historyScreen').hidden,false);
  const markup=app.$('historyList').innerHTML;assert.ok(markup.indexOf('Вторая цель')<markup.indexOf('Первая цель'));assert.match(markup,/Серебро/);assert.match(markup,/Бронза/);assert.match(markup,/Проекты/);assert.match(markup,/datetime="2026-11-24T12:00:00.000Z"/);
  assert.equal(app.storage.value,before);await app.$('historyBackBtn').click();assert.equal(app.$('collectionScreen').hidden,false);assert.equal(app.data().selectedCollection,'a');
  await app.$('backHomeBtn').click();await app.$('historyBtn').click();await app.$('historyBackBtn').click();assert.equal(app.$('homeScreen').hidden,false);
});

test('history removes unearned ordinary and platinum trophies, restores re-earned ones and has an empty state',async()=>{
  const app=launch(fixture());await app.$('historyBtn').click();assert.match(app.$('historyList').innerHTML,/Победы ещё впереди/);await app.$('historyBackBtn').click();
  await earn(app,'x');await earn(app,'y');await earn(app,'z');await app.$('historyBtn').click();assert.equal((app.$('historyList').innerHTML.match(/<article/g)||[]).length,4);
  await app.$('historyBackBtn').click();await earn(app,'z');await app.$('historyBtn').click();assert.doesNotMatch(app.$('historyList').innerHTML,/Платиновая победа|Третья цель/);
  assert.equal((app.$('historyList').innerHTML.match(/<article/g)||[]).length,2);
});

test('hidden earned titles are revealed in history; text is escaped and deleted trophies disappear',async()=>{
  const app=launch(fixture());await app.click('trophyGrid','edit','x');app.fields('trophyForm',{title:'<img src=x onerror=alert(1)>',hidden:true});await app.$('trophyForm').emit('submit');
  await app.$('historyBtn').click();assert.doesNotMatch(app.$('historyList').innerHTML,/&lt;img/);await app.$('historyBackBtn').click();await earn(app,'x');
  assert.doesNotMatch(app.$('awardFeedback').innerHTML,/<img/);assert.match(app.$('awardFeedback').innerHTML,/&lt;img/);
  await app.$('historyBtn').click();assert.doesNotMatch(app.$('historyList').innerHTML,/<img/);assert.match(app.$('historyList').innerHTML,/&lt;img/);
  await app.$('historyBackBtn').click();await app.click('trophyGrid','delete','x');await app.$('historyBtn').click();assert.doesNotMatch(app.$('historyList').innerHTML,/&lt;img/);
});

test('sound defaults off, toggling is silent and preference persists without modifying trophy data',async()=>{
  const app=launch(fixture(),undefined,{audio:true});const before=app.storage.value;
  assert.equal(app.$('soundToggle').getAttribute('aria-checked'),'false');await earn(app,'x',trusted);assert.equal(app.audio.contexts.length,0);
  const afterEarn=app.storage.value;await app.$('soundToggle').click();assert.equal(app.storage.value,afterEarn);assert.equal(app.storage.preferences,JSON.stringify({soundEnabled:true}));assert.equal(app.audio.contexts.length,0);
  const again=launch(undefined,app.storage,{audio:true});assert.equal(again.$('soundToggle').getAttribute('aria-checked'),'true');assert.equal(again.audio.contexts.length,0);assert.notEqual(before,again.storage.value);
  await again.$('soundToggle').click();assert.equal(again.$('soundToggle').getAttribute('aria-checked'),'false');assert.equal(JSON.parse(again.storage.preferences).soundEnabled,false);
});

test('enabled audio requires a trusted event and active user gesture',async()=>{
  for(const [options,event] of [[{audio:true},{}],[{audio:true,activation:false},trusted]]){
    const app=launch(undefined,soundStorage(fixture()),options);await earn(app,'x',event);
    assert.ok(byId(app,'x').earnedAt);assert.equal(app.audio.contexts.length,0);assert.equal(app.audio.oscillators.length,0);
  }
});

test('trusted ordinary acquisition plays a short local two-note cue; platinum uses a distinct four-note cue',async()=>{
  const app=launch(undefined,soundStorage(fixture()),{audio:true});await earn(app,'x',trusted);
  assert.equal(app.audio.contexts.length,1);assert.equal(app.audio.resumes.length,1);assert.deepEqual(app.audio.oscillators.map(o=>o.frequencyValue),[392,523]);
  await earn(app,'y',trusted);assert.deepEqual(app.audio.oscillators.slice(-2).map(o=>o.frequencyValue),[523,659]);
  const count=app.audio.oscillators.length;await earn(app,'z',trusted);assert.equal(app.audio.oscillators.length,count+4);assert.deepEqual(app.audio.oscillators.slice(-4).map(o=>o.frequencyValue),[523,659,784,1046]);
  assert.equal(app.audio.contexts.length,1);assert.ok(app.audio.oscillators.every(o=>o.stopCalls[0]-o.startTime<.21));
  const ordinary=fixture();ordinary.trophies=ordinary.trophies.filter(t=>t.id!=='p');const gold=launch(undefined,soundStorage(ordinary),{audio:true});await earn(gold,'z',trusted);assert.deepEqual(gold.audio.oscillators.map(o=>o.frequencyValue),[659,784]);
});

test('disabled sound cancels delayed resume and stops already scheduled oscillators',async()=>{
  const app=launch(undefined,soundStorage(fixture()),{audio:true,resume:'delayed'});await earn(app,'x',trusted);assert.equal(app.audio.pending.length,1);
  await app.$('soundToggle').click();app.audio.pending[0]();await flush();assert.equal(app.audio.oscillators.length,0);
  const running=launch(undefined,soundStorage(fixture()),{audio:true});await earn(running,'x',trusted);await running.$('soundToggle').click();assert.ok(running.audio.oscillators.every(o=>o.stopCalls.includes(undefined)));
});

test('import and undo cancel audio still waiting for resume',async()=>{
  for(const action of ['undo','import']){
    const app=launch(undefined,soundStorage(fixture()),{audio:true,resume:'delayed'});await earn(app,'x',trusted);
    if(action==='undo')await earn(app,'x',trusted);else await app.importFile(fixture());
    app.audio.pending[0]();await flush();assert.equal(app.audio.oscillators.length,0);assert.equal(app.$('awardFeedback').hidden,true);
  }
});

test('audio unavailable, denied or still suspended does not break saving, notification or history',async()=>{
  for(const environment of [{},{audio:true,resume:'reject'},{audio:true,resume:'suspend'}]){
    const app=launch(undefined,soundStorage(fixture()),environment);await earn(app,'x',trusted);await flush();
    assert.ok(byId(app,'x').earnedAt);assert.equal(app.$('awardFeedback').hidden,false);assert.equal(app.audio.oscillators.length,0);assert.equal(app.$('soundHint').hidden,false);
    await app.$('historyBtn').click();assert.match(app.$('historyList').innerHTML,/Первая цель/);
  }
});

test('preference corruption defaults off; preference write failure does not alter data or enabled state',async()=>{
  for(const preferences of ['{broken','null','{"soundEnabled":"true"}']){const app=launch(undefined,{value:JSON.stringify(fixture()),preferences});assert.equal(app.$('soundToggle').getAttribute('aria-checked'),'false');}
  const app=launch(fixture());const before=app.storage.value;app.storage.failWrite=true;await app.$('soundToggle').click();assert.equal(app.$('soundToggle').getAttribute('aria-checked'),'false');assert.equal(app.storage.value,before);assert.equal(app.$('soundHint').hidden,false);
});

test('platinum earned through deleting an unmet requirement or adding the platinum itself also celebrates',async()=>{
  const data=fixture();data.trophies.find(t=>t.id==='x').earnedAt=timestamp;data.trophies.find(t=>t.id==='y').earnedAt=timestamp;
  const app=launch(data);await app.click('trophyGrid','delete','z');assert.ok(byId(app,'p').earnedAt);assert.match(app.$('awardFeedback').innerHTML,/platinum-celebration/);
  const noPlatinum=fixture();noPlatinum.trophies=noPlatinum.trophies.filter(t=>t.id!=='p');for(const t of noPlatinum.trophies)t.earnedAt=timestamp;
  const created=launch(noPlatinum);await created.newTrophy({title:'Награда',rarity:'platinum',collection:'a'});assert.match(created.$('awardFeedback').innerHTML,/platinum-celebration/);
});
