const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launch, legacy, copy, html } = require('./harness.cjs');

const oldFields = t => Object.fromEntries(['id','title','description','rarity','collectionId','earnedAt','createdAt'].map(k => [k,t[k]]));

test('old ordinary trophies load without loss; automatic migration keeps the exact original backup', () => {
  const app = launch(legacy);
  assert.match(html, /<title>NTrophia<\/title>/); assert.doesNotMatch(html, /NASIK TROPHIES/);
  assert.deepEqual(oldFields(app.data().trophies[0]), legacy.trophies[0]);
  assert.equal(app.storage.backup, JSON.stringify(legacy)); assert.equal(app.data().schemaVersion, 2);
  assert.equal(app.$('earnedCount').textContent, 1); assert.equal(app.$('totalProgress').textContent, '100%');
  const again = launch(undefined, app.storage); assert.deepEqual(again.data(), app.data()); assert.equal(again.storage.backup, JSON.stringify(legacy));
});

test('create collections and trophies of all rarities; filters and scoped/global statistics', async () => {
  const app = launch(); await app.newCollection('Учёба', 'Наш набор'); const cid = app.data().selectedCollection;
  for (const rarity of ['platinum','gold','silver','bronze']) await app.newTrophy({ title: rarity, rarity, collection: cid });
  assert.equal(app.data().collections.length, 2); assert.equal(app.data().trophies.length, 4);
  assert.equal(app.$('allCount').textContent, 4); assert.equal(app.$('collectionTrophyCount').textContent, 4);
  const t = app.data().trophies.find(t => t.rarity === 'gold'); await app.click('trophyGrid','earn',t.id);
  assert.equal(app.$('collectionProgress').textContent, '25%'); assert.equal(app.$('totalProgress').textContent,'25%');
  await app.click('filters','filter','gold'); assert.equal(app.$('visibleCount').textContent, '1 трофей');
  assert.match(app.$('trophyGrid').innerHTML, /<h3>gold<\/h3>/); assert.equal(app.$('allCount').textContent, 4);
});

test('edit all fields of an ordinary earned trophy; cancel preserves the save', async () => {
  const app = launch(legacy); await app.open('general'); await app.click('trophyGrid','edit','old');
  assert.equal(app.$('trophyForm').elements.title.value,'Портфолио'); const before = app.storage.value;
  app.fields('trophyForm',{title:'Отмена'}); app.$('trophyDialog').close(); assert.equal(app.storage.value,before);
  await app.click('trophyGrid','edit','old'); app.fields('trophyForm',{title:'Готово',description:'Описание',rarity:'silver',collection:'languages'}); await app.$('trophyForm').emit('submit');
  assert.deepEqual(oldFields(app.data().trophies[0]), {...legacy.trophies[0],title:'Готово',description:'Описание',rarity:'silver',collectionId:'languages'});
  assert.equal(app.$('trophyDialog').open,false);
});

test('earning and unearning survive a fresh application load', async () => {
  let app = launch(legacy); await app.open('general'); await app.click('trophyGrid','earn','old');
  assert.equal(app.data().trophies[0].earnedAt,null); assert.equal(app.$('totalProgress').textContent,'0%');
  app = launch(undefined,app.storage); assert.equal(app.$('earnedCount').textContent,0); await app.click('trophyGrid','earn','old');
  assert.ok(Date.parse(app.data().trophies[0].earnedAt)); const again = launch(undefined,app.storage);
  assert.equal(again.$('earnedCount').textContent,1); assert.match(again.$('trophyGrid').innerHTML,/Получен/);
});

test('trophy deletion requires confirmation and persists', async () => {
  const app = launch(legacy); await app.open('general'); app.answer(false); await app.click('trophyGrid','delete','old'); assert.equal(app.data().trophies.length,1);
  app.answer(true); await app.click('trophyGrid','delete','old'); const again=launch(undefined,app.storage);
  assert.equal(again.data().trophies.length,0); assert.equal(again.$('totalProgress').textContent,'0%');
});

test('collection deletion moves trophies and preserves their dates, then persists', async () => {
  const app = launch(legacy); await app.open('general'); await app.$('deleteCollectionBtn').click();
  const before=app.storage.value; app.$('deleteCollectionDialog').close(); assert.equal(app.storage.value,before);
  await app.$('deleteCollectionBtn').click(); app.$('moveCollectionSelect').value='languages'; await app.$('deleteCollectionForm').emit('submit');
  const again=launch(undefined,app.storage); assert.equal(again.data().collections.length,1);
  assert.deepEqual(oldFields(again.data().trophies[0]),{...legacy.trophies[0],collectionId:'languages'});
  assert.equal(again.$('collectionProgress').textContent,'100%'); await again.$('deleteCollectionBtn').click(); assert.equal(again.$('deleteCollectionDialog').open,false);
});

test('last empty collection deletes; adding trophies after that requests a collection', async () => {
  const app=launch(); await app.open('general'); await app.$('deleteCollectionBtn').click(); await app.$('deleteCollectionForm').emit('submit');
  assert.deepEqual(app.data().collections,[]); await app.$('addTrophyBtn').click(); assert.equal(app.$('collectionDialog').open,true); assert.equal(app.$('trophyDialog').open,false);
  await app.newCollection('С нуля'); assert.equal(app.data().collections.length,1);
});

test('downloaded v2 JSON restores full data; cancelled import leaves data byte-for-byte intact', async () => {
  const app=launch(legacy); const expected=copy(app.data()); await app.$('exportBtn').click(); assert.equal(app.downloads.length,1);
  const raw=await app.blobs.get(app.downloads[0].href).text(); const backup=JSON.parse(raw);
  assert.equal(backup.version,2); assert.equal(backup.app,'NTrophia'); assert.deepEqual(backup.data,expected);
  await app.newTrophy(); const before=app.storage.value; app.answer(false); await app.importFile(raw); assert.equal(app.storage.value,before);
  app.answer(true); await app.importFile(raw); assert.deepEqual(app.data(),expected); assert.deepEqual(launch(undefined,app.storage).data(),expected);
  assert.equal(app.$('importBtn').disabled,false); assert.equal(app.$('importFile').value,'');
});

test('invalid JSON, duplicate ids, missing fields, bad dates, rarities and orphans leave data unchanged', async () => {
  const bad=['{','null','[]','{}',JSON.stringify({app:'NTrophia',version:3,data:legacy})];
  const mutate=fn=>{const v=copy(legacy);fn(v);bad.push(JSON.stringify(v));};
  mutate(v=>v.collections.push(v.collections[0])); mutate(v=>v.trophies.push(v.trophies[0]));
  mutate(v=>v.trophies[0].rarity='legendary'); mutate(v=>v.trophies[0].rarity='__proto__'); mutate(v=>v.trophies[0].collectionId='missing');
  mutate(v=>v.trophies[0].title=' '); mutate(v=>v.trophies[0].title='x'.repeat(91)); mutate(v=>delete v.trophies[0].description);
  mutate(v=>v.trophies[0].earnedAt='bad'); mutate(v=>v.trophies[0].createdAt='2026-02-30T00:00:00.000Z'); mutate(v=>v.collections[0].id='all');
  const app=launch(legacy),before=app.storage.value;
  for(const input of bad){await app.importFile(input);assert.equal(app.storage.value,before,input);assert.match(app.$('storageNotice').textContent,/Импорт отменён/);}
  assert.equal(app.confirmations.length,0); await app.importFile({app:'NTrophia',version:1,data:legacy});
  assert.deepEqual(oldFields(app.data().trophies[0]),legacy.trophies[0]); assert.equal(app.confirmations.length,1);
});

test('imported text is escaped; unknown navigation/filter values fall back safely', async () => {
  const payload=copy(legacy); payload.trophies[0].title='<img src=x onerror=alert(1)>'; payload.collections[0].name='<svg onload=alert(1)>';
  payload.selectedCollection='missing';payload.filter='unknown';const app=launch();await app.importFile(payload);
  assert.doesNotMatch(app.$('collectionList').innerHTML,/<svg/);assert.equal(app.data().selectedCollection,'all'); assert.equal(app.data().filter,'all');
  await app.open('general');assert.doesNotMatch(app.$('trophyGrid').innerHTML,/<img/);assert.match(app.$('trophyGrid').innerHTML,/&lt;img/);
});

test('storage errors leave edits, deletions, imports, dates and visible statistics unchanged', async () => {
  const app=launch(legacy);await app.open('general');const before=app.storage.value;app.storage.failWrite=true;
  await app.click('trophyGrid','earn','old');assert.equal(app.storage.value,before);assert.equal(app.$('earnedCount').textContent,1);
  await app.click('trophyGrid','edit','old');app.fields('trophyForm',{title:'Изменение'});await app.$('trophyForm').emit('submit');assert.equal(app.$('trophyDialog').open,true);
  await app.click('trophyGrid','delete','old');await app.newCollection('Не сохранится');await app.importFile({collections:[],trophies:[]});
  assert.equal(app.storage.value,before);assert.equal(app.$('earnedCount').textContent,1);assert.match(app.$('storageNotice').textContent,/Не удалось сохранить/);
  app.storage.failWrite=false;await app.importFile(legacy);assert.equal(app.$('storageNotice').hidden,true);
});

test('corrupt legacy save is preserved until a confirmed valid import', async () => {
  const app=launch('{broken');await app.newCollection('Не затереть');assert.equal(app.storage.value,'{broken');await app.$('exportBtn').click();assert.equal(app.downloads.length,0);
  await app.importFile(legacy);assert.deepEqual(oldFields(app.data().trophies[0]),legacy.trophies[0]);assert.equal(app.$('storageNotice').hidden,true);
});
