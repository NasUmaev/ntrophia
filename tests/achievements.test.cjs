const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launch, copy, timestamp } = require('./harness.cjs');
const fixture = () => ({
  collections: [{ id: 'a', name: 'Портфолио', createdAt: timestamp }, { id: 'b', name: 'Языки', createdAt: timestamp }],
  trophies: [
    { id: 'p', title: 'Платина портфолио', description: 'Все цели', rarity: 'platinum', collectionId: 'a', createdAt: timestamp, earnedAt: null },
    { id: 'x', title: 'Макет', description: 'Одна страница', rarity: 'gold', collectionId: 'a', createdAt: timestamp, earnedAt: null },
    { id: 'y', title: 'Запуск', description: 'Опубликовать проект', rarity: 'silver', collectionId: 'a', createdAt: timestamp, earnedAt: null }
  ], selectedCollection: 'a', filter: 'all'
});
const trophy = (app,id) => app.data().trophies.find(t => t.id === id);
const order = (app,cid='a') => app.data().trophies.filter(t=>t.collectionId===cid).sort((a,b)=>a.order-b.order).map(t=>t.id);
const edit = async (app,id,fields) => { await app.click('trophyGrid','edit',id);app.fields('trophyForm',fields);await app.$('trophyForm').emit('submit'); };

// Criteria cover state and markup produced by the actual application, not copied business logic.
test('platinum only unlocks with all ordinary trophies and cannot be toggled manually', async () => {
  const app=launch(fixture());const before=app.storage.value;
  await app.click('trophyGrid','earn','p');assert.equal(app.storage.value,before);
  assert.doesNotMatch(app.$('trophyGrid').innerHTML,/data-earn="p"/);
  await app.click('trophyGrid','earn','x');assert.equal(trophy(app,'p').earnedAt,null);assert.equal(app.$('collectionProgress').textContent,'33%');
  await app.click('trophyGrid','earn','y');assert.equal(trophy(app,'p').earnedAt,'2026-11-23T15:00:00.000Z');
  assert.equal(app.$('collectionProgress').textContent,'100%');assert.equal(app.$('remainingCount').textContent,0);
  const full=app.storage.value;await app.click('trophyGrid','earn','p');assert.equal(app.storage.value,full);
  assert.match(app.$('platinumSummary').textContent,/Получена/);
});

test('empty collections and platinum-only collections cannot earn platinum', async () => {
  const data=fixture();data.trophies=[];const empty=launch(data);assert.equal(empty.$('collectionProgress').textContent,'0%');assert.match(empty.$('platinumSummary').textContent,/ещё нет/);
  await empty.$('addPlatinumBtn').click();assert.equal(empty.$('trophyForm').elements.rarity.value,'platinum');
  empty.fields('trophyForm',{title:'За всё'});await empty.$('trophyForm').emit('submit');
  assert.equal(empty.data().trophies.length,1);assert.equal(empty.data().trophies[0].earnedAt,null);assert.match(empty.$('platinumConditions').textContent,/хотя бы один/);
  const old=fixture();old.trophies=old.trophies.slice(0,1);old.trophies[0].earnedAt=timestamp;
  const app=launch(old);assert.equal(trophy(app,'p').earnedAt,null);assert.deepEqual(trophy(app,'p').earnedHistory,[timestamp]);
});

test('unearning a requirement locks platinum; re-earning records a new date and retains prior dates', async () => {
  const app=launch(fixture());await app.click('trophyGrid','earn','x');await app.click('trophyGrid','earn','y');
  const first=trophy(app,'p').earnedAt;app.time('2026-11-24T12:00:00.000Z');await app.click('trophyGrid','earn','x');
  assert.equal(trophy(app,'p').earnedAt,null);assert.deepEqual(trophy(app,'p').earnedHistory,[first]);assert.equal(app.$('collectionProgress').textContent,'33%');
  await app.click('trophyGrid','earn','x');assert.equal(trophy(app,'p').earnedAt,'2026-11-24T12:00:00.000Z');
  assert.deepEqual(trophy(app,'p').earnedHistory,[first,'2026-11-24T12:00:00.000Z']);
  const again=launch(undefined,app.storage);assert.equal(trophy(again,'p').earnedAt,'2026-11-24T12:00:00.000Z');
  assert.deepEqual(trophy(again,'p').earnedHistory,trophy(app,'p').earnedHistory);
});

test('adding/removing requirements recalculates platinum; deleting the last ordinary trophy locks it', async () => {
  const app=launch(fixture());await app.click('trophyGrid','earn','x');await app.click('trophyGrid','earn','y');
  await app.newTrophy({collection:'a'});const added=app.data().trophies.at(-1).id;assert.equal(trophy(app,'p').earnedAt,null);
  await app.click('trophyGrid','delete',added);assert.ok(trophy(app,'p').earnedAt);
  await app.click('trophyGrid','delete','x');assert.ok(trophy(app,'p').earnedAt);
  await app.click('trophyGrid','delete','y');assert.equal(trophy(app,'p').earnedAt,null);assert.equal(app.$('collectionProgress').textContent,'0%');
});

test('create, edit, or move cannot duplicate a platinum; rejected operations do not write', async () => {
  const app=launch(fixture());let before=app.storage.value;
  await app.newTrophy({title:'Вторая платина',rarity:'platinum',collection:'a'});assert.equal(app.storage.value,before);assert.equal(app.$('trophyDialog').open,true);assert.equal(app.$('trophyDialogError').hidden,false);assert.match(app.$('trophyDialogError').textContent,/уже есть платина/);
  await edit(app,'x',{rarity:'platinum'});assert.equal(app.storage.value,before);
  await app.newTrophy({title:'Платина B',rarity:'platinum',collection:'b'});before=app.storage.value;
  await edit(app,'p',{collection:'b'});assert.equal(app.storage.value,before);
  assert.equal(app.data().trophies.filter(t=>t.collectionId==='a'&&t.rarity==='platinum').length,1);
  assert.equal(app.data().trophies.filter(t=>t.collectionId==='b'&&t.rarity==='platinum').length,1);
});

test('editing or moving ordinary trophies recomputes both source and destination platinum', async () => {
  const app=launch(fixture());await app.click('trophyGrid','earn','x');await app.click('trophyGrid','earn','y');
  await app.newTrophy({title:'Платина B',rarity:'platinum',collection:'b'});const pb=app.data().trophies.at(-1).id;
  await edit(app,'x',{collection:'b'});assert.ok(trophy(app,'p').earnedAt);assert.ok(trophy(app,pb).earnedAt);
  const date=trophy(app,'y').earnedAt;await edit(app,'y',{collection:'b'});assert.equal(trophy(app,'p').earnedAt,null);assert.ok(trophy(app,pb).earnedAt);assert.equal(trophy(app,'y').earnedAt,date);
  await app.open('b');await app.newTrophy({title:'Не получен',collection:'b'});assert.equal(trophy(app,pb).earnedAt,null);
});

test('legacy duplicate platinum migration preserves every trophy and date and is idempotent', async () => {
  const data=fixture();data.trophies[0].earnedAt=timestamp;
  data.trophies.push({...data.trophies[0],id:'second-p',title:'Другая старая платина'});
  const app=launch(data);assert.equal(app.data().trophies.length,4);assert.equal(trophy(app,'p').earnedAt,null);
  assert.deepEqual(trophy(app,'p').earnedHistory,[timestamp]);assert.equal(trophy(app,'second-p').rarity,'gold');
  assert.equal(trophy(app,'second-p').legacyRarity,'platinum');assert.equal(trophy(app,'second-p').earnedAt,timestamp);
  assert.deepEqual(order(app),['p','x','y','second-p']);assert.equal(app.storage.backup,JSON.stringify(data));
  const snapshot=app.storage.value,again=launch(undefined,app.storage);assert.equal(again.storage.value,snapshot);
  await app.$('exportBtn').click();const raw=await app.blobs.get(app.downloads[0].href).text();await app.importFile(raw);
  assert.equal(app.storage.value,snapshot);
});

test('legacy complete platinum retains its date; missing descriptions, hidden flags and order get safe defaults', () => {
  const data=fixture();for(const t of data.trophies)t.earnedAt=timestamp;
  const app=launch(data);assert.equal(trophy(app,'p').earnedAt,timestamp);assert.deepEqual(trophy(app,'p').earnedHistory,[timestamp]);
  assert.equal(app.data().collections[0].description,'');assert.equal(trophy(app,'x').hidden,false);assert.deepEqual(order(app),['p','x','y']);
  const again=launch(undefined,app.storage);assert.equal(trophy(again,'p').earnedAt,timestamp);
});

test('home cards open full collection screens; collection metadata and scoped stats edit and persist', async () => {
  const data=fixture();data.selectedCollection='all';const app=launch(data);
  assert.equal(app.$('homeScreen').hidden,false);assert.equal(app.$('collectionScreen').hidden,true);assert.equal(app.$('trophyGrid').innerHTML,'');assert.match(app.$('collectionList').innerHTML,/collection-card/);
  await app.open('a');assert.equal(app.$('homeScreen').hidden,true);assert.equal(app.$('collectionScreen').hidden,false);assert.equal(app.$('collectionTitle').textContent,'Портфолио');
  assert.equal(app.$('collectionTrophyCount').textContent,3);assert.match(app.$('rarityCounts').innerHTML,/Платина/);assert.match(app.$('rarityCounts').innerHTML,/0\/1/);
  await app.$('editCollectionBtn').click();app.fields('collectionForm',{title:'Мои проекты',description:'Полный набор'});await app.$('collectionForm').emit('submit');
  assert.equal(app.$('collectionTitle').textContent,'Мои проекты');assert.equal(app.$('collectionDescription').textContent,'Полный набор');assert.equal(app.data().collections[0].createdAt,timestamp);
  const again=launch(undefined,app.storage);assert.equal(again.$('collectionScreen').hidden,false);assert.equal(again.$('collectionDescription').textContent,'Полный набор');
  await app.$('backHomeBtn').click();assert.equal(app.$('homeScreen').hidden,false);assert.equal(app.$('collectionScreen').hidden,true);assert.match(app.$('collectionList').innerHTML,/Полный набор/);
  await app.open('b');assert.equal(app.$('collectionTrophyCount').textContent,0);assert.equal(app.$('allCount').textContent,3);assert.equal(app.$('collectionProgress').textContent,'0%');
});

test('up/down reorder all trophy types within their collection without altering dates; bounds/filter are safe', async () => {
  const data=fixture();for(const t of data.trophies)t.earnedAt=timestamp;const app=launch(data);
  const dates=app.data().trophies.map(t=>[t.id,t.earnedAt,t.createdAt]);
  await app.click('trophyGrid','up','p');assert.deepEqual(order(app),['p','x','y']);
  await app.click('trophyGrid','up','y');assert.deepEqual(order(app),['p','y','x']);
  await app.click('trophyGrid','down','p');assert.deepEqual(order(app),['y','p','x']);
  assert.ok(app.$('trophyGrid').innerHTML.indexOf('<h3>Запуск')<app.$('trophyGrid').innerHTML.indexOf('<h3>Платина портфолио'));
  assert.deepEqual(app.data().trophies.map(t=>[t.id,t.earnedAt,t.createdAt]),dates);
  let before=app.storage.value;await app.click('trophyGrid','down','x');assert.equal(app.storage.value,before);
  await app.click('filters','filter','gold');before=app.storage.value;await app.click('trophyGrid','up','x');assert.equal(app.storage.value,before);
  await app.click('filters','filter','all');const again=launch(undefined,app.storage);assert.deepEqual(order(again),['y','p','x']);assert.deepEqual(again.data().trophies.map(t=>[t.id,t.earnedAt,t.createdAt]),dates);
  await again.open('b');before=again.storage.value;await again.click('trophyGrid','up','x');assert.equal(again.storage.value,before);
});

test('hidden trophies conceal title, description and accessible labels; reveal is explicit and not persisted', async () => {
  const app=launch(fixture());await edit(app,'x',{title:'Секретный макет',description:'Скрытые условия',hidden:true});
  assert.doesNotMatch(app.$('trophyGrid').innerHTML,/Секретный макет|Скрытые условия/);assert.match(app.$('trophyGrid').innerHTML,/Секретное достижение/);
  const before=app.storage.value;await app.click('trophyGrid','reveal','x');assert.equal(app.$('secretDialog').open,true);
  assert.equal(app.$('secretTitle').textContent,'Секретный макет');assert.equal(app.$('secretDescription').textContent,'Скрытые условия');assert.equal(app.storage.value,before);
  app.$('secretDialog').close();await app.click('trophyGrid','earn','x');assert.match(app.$('trophyGrid').innerHTML,/Секретный макет/);assert.match(app.$('trophyGrid').innerHTML,/Скрытые условия/);
  await app.click('trophyGrid','earn','y');assert.ok(trophy(app,'p').earnedAt);
  await app.click('trophyGrid','earn','x');assert.equal(trophy(app,'p').earnedAt,null);assert.doesNotMatch(app.$('trophyGrid').innerHTML,/Секретный макет|Скрытые условия/);
  const again=launch(undefined,app.storage);assert.equal(trophy(again,'x').hidden,true);assert.equal(again.$('secretDialog').open,false);assert.doesNotMatch(again.$('trophyGrid').innerHTML,/Секретный макет/);
});

test('hidden platinum has no leaked title in summary or list, and reveals automatically when earned', async () => {
  const app=launch(fixture());await edit(app,'p',{title:'Тайная платина',description:'Тайное условие',hidden:true});
  assert.doesNotMatch(app.$('trophyGrid').innerHTML,/Тайная платина|Тайное условие/);assert.doesNotMatch(app.$('platinumSummary').textContent,/Тайная платина/);
  await app.click('trophyGrid','earn','x');await app.click('trophyGrid','earn','y');assert.match(app.$('trophyGrid').innerHTML,/Тайная платина/);assert.match(app.$('platinumSummary').textContent,/Тайная платина/);
});

test('v2 export/import restores description, hidden state, order, platinum history and dates exactly', async () => {
  const app=launch(fixture());await edit(app,'y',{hidden:true});await app.click('trophyGrid','earn','x');await app.click('trophyGrid','earn','y');await app.click('trophyGrid','up','y');
  await app.$('editCollectionBtn').click();app.fields('collectionForm',{description:'Новый игровой набор'});await app.$('collectionForm').emit('submit');
  const expected=copy(app.data());await app.$('exportBtn').click();const raw=await app.blobs.get(app.downloads[0].href).text();
  await app.click('trophyGrid','earn','x');await app.importFile(raw);assert.deepEqual(app.data(),expected);
  const again=launch(undefined,app.storage);assert.deepEqual(again.data(),expected);assert.deepEqual(order(again),['p','y','x']);
});

test('v2 import rejects duplicate platinum, invalid hidden/order/history and schema versions before confirmation', async () => {
  const app=launch(fixture()),valid=copy(app.data()),before=app.storage.value;
  const mutations=[v=>{v.trophies[1].rarity='platinum';},v=>{v.trophies[1].hidden='true';},v=>{delete v.trophies[1].hidden;},v=>{v.trophies[1].order=-1;},v=>{v.trophies[1].order=0;},v=>{v.trophies[1].order=1.5;},v=>{v.trophies[0].earnedHistory=['bad'];},v=>{v.collections[0].description=7;},v=>{v.schemaVersion=3;}];
  for(const mutate of mutations){const bad=copy(valid);mutate(bad);await app.importFile({app:'NTrophia',version:2,data:bad});assert.equal(app.storage.value,before);assert.match(app.$('storageNotice').textContent,/Импорт отменён/);}
  assert.equal(app.confirmations.length,0);await app.importFile({app:'NTrophia',version:2,data:fixture()});assert.equal(app.storage.value,before);assert.equal(app.confirmations.length,0);
});

test('imported forged earned platinum is locked, and complete requirements award missing platinum', async () => {
  const app=launch(fixture()),forged=copy(app.data());forged.trophies[0].earnedAt=timestamp;
  await app.importFile(forged);assert.equal(trophy(app,'p').earnedAt,null);assert.ok(trophy(app,'p').earnedHistory.includes(timestamp));
  const complete=copy(app.data());for(const t of complete.trophies)if(t.rarity!=='platinum')t.earnedAt=timestamp;
  await app.importFile(complete);assert.ok(trophy(app,'p').earnedAt);assert.equal(app.$('collectionProgress').textContent,'100%');
});

test('collection merge with two platinum trophies is blocked without data loss', async () => {
  const app=launch(fixture());await app.newTrophy({title:'Платина B',rarity:'platinum',collection:'b'});await app.$('deleteCollectionBtn').click();app.$('moveCollectionSelect').value='b';
  const before=app.storage.value;await app.$('deleteCollectionForm').emit('submit');assert.equal(app.storage.value,before);assert.equal(app.$('deleteCollectionDialog').open,true);assert.match(app.$('storageNotice').textContent,/обеих коллекциях/);assert.equal(app.$('deleteCollectionDialogError').hidden,false);
});

test('collection merge appends source order after target; platinum recalculates and ordinary dates survive', async () => {
  const app=launch(fixture());await app.click('trophyGrid','earn','x');const xDate=trophy(app,'x').earnedAt;
  await app.newTrophy({title:'Язык',collection:'b'});const bId=app.data().trophies.at(-1).id;await app.click('trophyGrid','up','y');
  await app.$('deleteCollectionBtn').click();app.$('moveCollectionSelect').value='b';await app.$('deleteCollectionForm').emit('submit');
  assert.deepEqual(order(app,'b'),[bId,'p','y','x']);assert.equal(trophy(app,'x').earnedAt,xDate);assert.equal(trophy(app,'p').earnedAt,null);assert.equal(app.data().collections.length,1);
  for(const t of app.data().trophies)if(t.rarity!=='platinum'&&!t.earnedAt)await app.click('trophyGrid','earn',t.id);
  assert.ok(trophy(app,'p').earnedAt);assert.equal(app.$('collectionProgress').textContent,'100%');
});

test('storage failure leaves automatic platinum, order and hidden flags unchanged', async () => {
  const app=launch(fixture());await app.click('trophyGrid','earn','x');const before=app.storage.value;app.storage.failWrite=true;
  await app.click('trophyGrid','earn','y');assert.equal(app.storage.value,before);assert.equal(trophy(app,'p').earnedAt,null);assert.equal(app.$('collectionProgress').textContent,'33%');
  await app.click('trophyGrid','up','y');await edit(app,'y',{hidden:true});assert.equal(app.storage.value,before);
});

test('migration write failure retains raw old data; retry backs it up before the first successful write', async () => {
  const data=fixture(),storage={value:JSON.stringify(data),failWrite:true};const app=launch(undefined,storage);
  assert.equal(storage.value,JSON.stringify(data));assert.equal(storage.backup,undefined);assert.match(app.$('storageNotice').textContent,/Исходное сохранение/);
  storage.failWrite=false;await app.click('trophyGrid','earn','x');assert.equal(storage.backup,JSON.stringify(data));assert.equal(app.data().schemaVersion,2);assert.ok(trophy(app,'x').earnedAt);
});
