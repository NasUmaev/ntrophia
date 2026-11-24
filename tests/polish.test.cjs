const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launch, copy, timestamp, html } = require('./harness.cjs');
const fixture = () => ({
  collections:[{id:'a',name:'Проекты',createdAt:timestamp},{id:'b',name:'Учёба',createdAt:timestamp},{id:'empty',name:'Пустая',createdAt:timestamp}],
  trophies:[
    {id:'p',title:'Платина',description:'Все проекты',rarity:'platinum',collectionId:'a',createdAt:timestamp,earnedAt:null},
    {id:'x',title:'Первый проект',description:'Разработка сайта',rarity:'gold',collectionId:'a',createdAt:timestamp,earnedAt:null},
    {id:'y',title:'Макет',description:'Нарисовать проект',rarity:'silver',collectionId:'a',createdAt:timestamp,earnedAt:timestamp},
    {id:'z',title:'Урок',description:'Проект на языке',rarity:'bronze',collectionId:'b',createdAt:timestamp,earnedAt:'2026-11-24T08:00:00.000Z'},
    {id:'q',title:'Экзамен',description:'Повторение',rarity:'gold',collectionId:'b',createdAt:timestamp,earnedAt:null}
  ],selectedCollection:'a',filter:'all'
});
const ids = markup => [...markup.matchAll(/data-edit="([^"]+)"/g)].map(m=>m[1]);
async function query(app,value,home=false){app.$(home?'homeSearchInput':'searchTrophies').value=value;await app.$(home?'homeSearchInput':'searchTrophies').emit('input');}
async function sort(app,value,home=false){app.$(home?'homeSortSelect':'sortTrophies').value=value;await app.$(home?'homeSortSelect':'sortTrophies').emit('change');}
const earn=(app,id,options={})=>app.click('trophyGrid','earn',id,options);

// Product-level invariants exercise the actual script, rather than reimplementing its formulas.
test('profile and home agree on totals and rarity counts; empty collections are never completed',async()=>{
  const app=launch(fixture());await app.$('profileBtn').click();
  assert.equal(app.$('profileScreen').hidden,false);assert.equal(app.$('homeScreen').hidden,true);assert.equal(app.$('collectionScreen').hidden,true);
  assert.equal(app.$('profileEarnedCount').textContent,2);assert.equal(app.$('profileTotalCount').textContent,5);assert.equal(app.$('profileProgress').textContent,'40%');assert.equal(app.$('profileCompletedCount').textContent,0);
  for(const [name,value]of[['Platinum',0],['Gold',0],['Silver',1],['Bronze',1]])assert.equal(app.$(`profile${name}Count`).textContent,value);
  assert.equal(app.$('profileEarnedCount').textContent,app.$('earnedCount').textContent);assert.equal(app.$('profileProgress').textContent,app.$('totalProgress').textContent);
  await app.$('profileBackBtn').click();await earn(app,'x');assert.equal(app.$('profileEarnedCount').textContent,4);assert.equal(app.$('profilePlatinumCount').textContent,1);assert.equal(app.$('profileCompletedCount').textContent,1);
  await app.open('b');await earn(app,'q');assert.equal(app.$('profileCompletedCount').textContent,2);assert.equal(app.$('profileProgress').textContent,'100%');
  await app.open('a');await earn(app,'y');assert.equal(app.$('profileCompletedCount').textContent,1);assert.equal(app.$('profilePlatinumCount').textContent,0);assert.equal(app.$('profileProgress').textContent,'60%');
});

test('ordinary-only completed sets count; platinum-only and empty sets do not',()=>{
  const data=fixture();data.trophies=data.trophies.filter(t=>['p','z'].includes(t.id));const app=launch(data);
  assert.equal(app.$('profileCompletedCount').textContent,1);assert.equal(app.$('profileEarnedCount').textContent,1);assert.equal(app.$('profileProgress').textContent,'50%');
});

test('recent profile awards share history ordering and show only the latest five current acquisitions',async()=>{
  const data=fixture();data.trophies=Array.from({length:7},(_,i)=>({id:`r${i}`,title:`Награда ${i}`,description:'',rarity:'bronze',collectionId:'a',createdAt:timestamp,earnedAt:`2026-11-${String(15+i).padStart(2,'0')}T12:00:00.000Z`}));
  const app=launch(data);const recent=app.$('profileRecentList').innerHTML;assert.equal((recent.match(/<article/g)||[]).length,5);assert.ok(recent.indexOf('Награда 6')<recent.indexOf('Награда 5'));assert.doesNotMatch(recent,/Награда [01]/);
  await app.$('historyBtn').click();assert.equal((app.$('historyList').innerHTML.match(/<article/g)||[]).length,7);
  await app.$('historyBackBtn').click();await earn(app,'r6');assert.doesNotMatch(app.$('profileRecentList').innerHTML,/Награда 6/);assert.match(app.$('profileRecentList').innerHTML,/Награда 1/);
});

test('profile/history navigation returns through visited sections without writing trophy data',async()=>{
  const app=launch(fixture()),before=app.storage.value;
  await app.$('profileBtn').click();await app.$('historyBtn').click();assert.equal(app.$('historyScreen').hidden,false);assert.equal(app.$('profileScreen').hidden,true);
  await app.$('historyBackBtn').click();assert.equal(app.$('profileScreen').hidden,false);await app.$('profileBackBtn').click();assert.equal(app.$('collectionScreen').hidden,false);
  assert.equal(app.storage.value,before);await app.$('backHomeBtn').click();await app.$('profileBtn').click();await app.$('profileBackBtn').click();assert.equal(app.$('homeScreen').hidden,false);
});

test('collection search matches title/description case-insensitively, handles spaces and ё, and combines with rarity',async()=>{
  const data=fixture();data.trophies.find(t=>t.id==='x').description='Чёрный макет';const app=launch(data),before=app.storage.value;
  await query(app,'  ЧЕРНЫЙ  ');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['x']);assert.equal(app.storage.value,before);
  await query(app,'МАКЕТ');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['x','y']);
  await app.click('filters','filter','silver');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['y']);assert.equal(app.$('profileEarnedCount').textContent,2);assert.equal(app.$('collectionTrophyCount').textContent,3);
  await query(app,'ничего такого');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),[]);assert.match(app.$('trophyGrid').innerHTML,/не найдено/);
});

test('global search spans collections with working rarity filters, sort and links back to the collection',async()=>{
  const app=launch(fixture());await app.$('backHomeBtn').click();await query(app,'проект',true);
  assert.equal(app.$('collectionList').hidden,true);assert.equal(app.$('homeSearchPanel').hidden,false);assert.deepEqual(ids(app.$('homeTrophyGrid').innerHTML),['p','x','y','z']);
  await app.click('homeFilters','filter','bronze');assert.deepEqual(ids(app.$('homeTrophyGrid').innerHTML),['z']);assert.match(app.$('homeTrophyGrid').innerHTML,/Открыть: Учёба/);assert.doesNotMatch(app.$('homeTrophyGrid').innerHTML,/data-up=/);
  await app.click('homeFilters','filter','all');await sort(app,'date',true);assert.deepEqual(ids(app.$('homeTrophyGrid').innerHTML),['z','y','p','x']);
  await app.click('homeTrophyGrid','open-collection','b');assert.equal(app.$('collectionTitle').textContent,'Учёба');assert.equal(app.$('homeScreen').hidden,true);
  await app.$('backHomeBtn').click();await query(app,'',true);assert.equal(app.$('collectionList').hidden,false);assert.equal(app.$('homeSearchPanel').hidden,true);
});

test('all four sort modes work and do not change stored dates, user order, stats or notifications',async()=>{
  const data=fixture();data.trophies=data.trophies.filter(t=>t.id!=='p');data.trophies.find(t=>t.id==='z').collectionId='a';
  const app=launch(data),before=app.storage.value;assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['x','y','z']);
  await sort(app,'rarity');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['x','y','z']);
  await sort(app,'date');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['z','y','x']);
  await sort(app,'name');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['y','x','z']);
  await sort(app,'custom');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['x','y','z']);assert.equal(app.storage.value,before);assert.equal(app.$('awardFeedback').hidden,true);
});

test('sorts compose with existing filters and search without changing full-set statistics',async()=>{
  const data=fixture();data.trophies.find(t=>t.id==='x').title='Макет 2';data.trophies.find(t=>t.id==='q').collectionId='a';data.trophies.find(t=>t.id==='q').title='Макет 10';const app=launch(data);
  await query(app,'макет');await sort(app,'name');await app.click('filters','filter','gold');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['x','q']);
  assert.equal(app.$('visibleCount').textContent,'2 трофея');assert.equal(app.$('collectionTrophyCount').textContent,4);assert.equal(app.$('profileTotalCount').textContent,5);
});

test('secret title and description cannot be discovered in either search scope before acquisition',async()=>{
  const data=fixture();Object.assign(data.trophies.find(t=>t.id==='x'),{hidden:true,title:'Кодовое слово',description:'Тайный пароль'});const app=launch(data);
  for(const q of ['Кодовое','пароль']){await query(app,q);assert.deepEqual(ids(app.$('trophyGrid').innerHTML),[]);await app.$('backHomeBtn').click();await query(app,q,true);assert.deepEqual(ids(app.$('homeTrophyGrid').innerHTML),[]);await app.open('a');}
  await query(app,'секретное');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['x']);assert.doesNotMatch(app.$('trophyGrid').innerHTML,/Кодовое слово|Тайный пароль/);
  await app.click('trophyGrid','reveal','x');assert.equal(app.$('secretTitle').textContent,'Кодовое слово');app.$('secretDialog').close();await query(app,'пароль');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),[]);
  await earn(app,'x');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['x']);await earn(app,'x');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),[]);
});

test('name sorting of unrevealed secrets uses their visible placeholder, never their real names',async()=>{
  const data=fixture();Object.assign(data.trophies.find(t=>t.id==='x'),{hidden:true,title:'ААА'});Object.assign(data.trophies.find(t=>t.id==='y'),{hidden:true,title:'ЯЯЯ',earnedAt:null});
  const app=launch(data);await sort(app,'name');const original=ids(app.$('trophyGrid').innerHTML);
  const swapped=copy(app.data());swapped.trophies.find(t=>t.id==='x').title='ЯЯЯ';swapped.trophies.find(t=>t.id==='y').title='ААА';
  const other=launch(swapped);await sort(other,'name');assert.deepEqual(ids(other.$('trophyGrid').innerHTML),original);assert.doesNotMatch(other.$('trophyGrid').innerHTML,/ААА|ЯЯЯ/);
});

test('manual reorder is blocked during search or alternative sorting and resumes without losing previous order',async()=>{
  const app=launch(fixture());await sort(app,'name');let before=app.storage.value;await app.click('trophyGrid','up','y');assert.equal(app.storage.value,before);assert.match(app.$('orderHint').textContent,/Мой порядок/);
  await sort(app,'custom');await query(app,'макет');before=app.storage.value;await app.click('trophyGrid','up','y');assert.equal(app.storage.value,before);
  await query(app,'');await app.click('trophyGrid','up','y');assert.deepEqual(ids(app.$('trophyGrid').innerHTML),['p','y','x']);
  const again=launch(undefined,app.storage);assert.deepEqual(ids(again.$('trophyGrid').innerHTML),['p','y','x']);
});

test('global result actions update profile and history; searches preserve collection scope on return',async()=>{
  const app=launch(fixture());await app.$('backHomeBtn').click();await query(app,'Первый',true);await app.click('homeTrophyGrid','earn','x');assert.equal(app.$('profileEarnedCount').textContent,4);assert.equal(app.$('profileCompletedCount').textContent,1);
  await app.$('profileBtn').click();assert.match(app.$('profileRecentList').innerHTML,/Первый проект/);await app.$('historyBtn').click();assert.match(app.$('historyList').innerHTML,/Первый проект/);
  await app.$('historyBackBtn').click();await app.$('profileBackBtn').click();assert.equal(app.$('homeSearchInput').value,'Первый');assert.deepEqual(ids(app.$('homeTrophyGrid').innerHTML),['x']);
});

test('query and sort stay in-session, export/import preserve achievement data and reset query UI',async()=>{
  const app=launch(fixture()),expected=copy(app.data());await query(app,'Макет');await sort(app,'date');await app.$('profileBtn').click();await app.$('exportBtn').click();
  const raw=await app.blobs.get(app.downloads[0].href).text();assert.deepEqual(JSON.parse(raw).data,expected);assert.equal(JSON.parse(raw).version,2);
  await app.importFile(raw);assert.deepEqual(app.data(),expected);assert.equal(app.$('searchTrophies').value,'');assert.equal(app.$('sortTrophies').value,'custom');assert.equal(app.$('profileScreen').hidden,true);
  const again=launch(undefined,app.storage);assert.deepEqual(again.data(),expected);assert.equal(again.$('profileProgress').textContent,app.$('profileProgress').textContent);
});

test('profile recomputes after edit/move/delete of collections and confirmed import',async()=>{
  const app=launch(fixture());await earn(app,'x');assert.equal(app.$('profileCompletedCount').textContent,1);
  await app.click('trophyGrid','edit','x');app.fields('trophyForm',{collection:'b',title:'Перенесён'});await app.$('trophyForm').emit('submit');assert.equal(app.$('profileEarnedCount').textContent,4);
  await app.open('b');await app.$('editCollectionBtn').click();app.fields('collectionForm',{title:'Обучение'});await app.$('collectionForm').emit('submit');assert.match(app.$('profileRecentList').innerHTML,/Обучение/);
  await app.click('trophyGrid','delete','x');assert.equal(app.$('profileEarnedCount').textContent,3);
  await app.importFile({collections:[],trophies:[]});assert.equal(app.$('profileEarnedCount').textContent,0);assert.equal(app.$('profileCompletedCount').textContent,0);assert.equal(app.$('profileProgress').textContent,'0%');assert.match(app.$('profileRecentList').innerHTML,/Победы ещё впереди/);
});

test('corrupt storage is not overwritten by profile, search, sort or failed import',async()=>{
  const app=launch('{broken'),before=app.storage.value;await app.$('profileBtn').click();assert.equal(app.$('profileProgress').textContent,'0%');await app.$('profileBackBtn').click();
  await query(app,'поиск',true);await sort(app,'name',true);await app.importFile('{wrong');assert.equal(app.storage.value,before);assert.equal(app.$('storageNotice').hidden,false);
});

test('layout has bounded modal height, flexible controls and content wrapping rather than clipping overflow',()=>{
  assert.match(html,/max-height:\s*calc\(100dvh - 28px\)/);assert.match(html,/overflow-y:\s*auto/);assert.match(html,/\.query-controls\s*\{[^}]*minmax\(0, 1fr\)/);
  assert.match(html,/@media\s*\(max-width:\s*560px\)[\s\S]*\.query-controls\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(html,/\.section-head\s*\{\s*flex-wrap:\s*wrap/);assert.doesNotMatch(html,/overflow-x:\s*hidden/);
});

test('undoing an older visible notification does not cut off a newer still-valid trophy sound',async()=>{
  const data=fixture();for(const t of data.trophies)t.earnedAt=null;data.trophies.find(t=>t.id==='q').collectionId='a';
  const app=launch(undefined,{value:JSON.stringify(data),preferences:'{"soundEnabled":true}'},{audio:true});
  await earn(app,'x',{isTrusted:true});await new Promise(r=>setImmediate(r));await earn(app,'y',{isTrusted:true});await new Promise(r=>setImmediate(r));
  const latest=app.audio.oscillators.slice(-2);await earn(app,'x',{isTrusted:true});assert.ok(latest.every(o=>!o.stopCalls.includes(undefined)));
});
