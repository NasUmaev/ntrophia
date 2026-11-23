const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const KEY = 'nasik-trophies-v1';
const timestamp = '2026-11-23T12:00:00.000Z';
const legacy = {
  collections: [{ id: 'general', name: 'Старые цели', createdAt: timestamp }, { id: 'languages', name: 'Языки', createdAt: timestamp }],
  trophies: [{ id: 'old', title: 'Портфолио', description: 'Первая версия', rarity: 'platinum', collectionId: 'general', earnedAt: timestamp, createdAt: timestamp }],
  selectedCollection: 'all', filter: 'all'
};
const copy = value => JSON.parse(JSON.stringify(value));

// Minimal DOM adapter: executes the real inline script and its registered handlers.
// Browser layout, native dialogs and file pickers are intentionally outside this harness.
function launch(initial, storage = { value: initial === undefined ? null : typeof initial === 'string' ? initial : JSON.stringify(initial) }) {
  const nodes = new Map(); const confirmations = [], downloads = [], blobs = new Map();
  let answer = true, id = 0;
  class Element {
    constructor(name, tag = '') { this.id = name; this.tag = tag; this.value = ''; this.textContent = ''; this.hidden = false; this.open = false; this.style = {}; this.files = []; this.listeners = {}; this.classList = { add() {}, remove() {} }; }
    set innerHTML(value) { this.markup = value; if (this.tag === 'select') this.value = value.match(/<option value="([^"]*)"/)?.[1] ?? ''; }
    get innerHTML() { return this.markup ?? ''; }
    addEventListener(event, callback) { (this.listeners[event] ??= []).push(callback); }
    async emit(type, options = {}) { const event = { target: this, currentTarget: this, preventDefault() {}, ...options }; for (const callback of this.listeners[type] ?? []) await callback(event); }
    click() { if (this.tag === 'a') downloads.push({ href: this.href, filename: this.download }); return this.emit('click'); }
    focus() {} remove() {} showModal() { this.open = true; } close() { this.open = false; }
    reset() { for (const field of Object.values(this.elements ?? {})) field.value = field.defaultValue ?? ''; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 400, bottom: 400 }; }
  }
  for (const m of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) nodes.set(m[2], new Element(m[2], m[1]));
  for (const m of html.matchAll(/<form\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)) {
    const form = nodes.get(m[1]); form.elements = {};
    for (const field of m[2].matchAll(/<(input|textarea|select)\b([^>]*\bname="([^"]+)"[^>]*)>([\s\S]*?)(?:<\/\1>|(?=<))/g)) {
      const fid = field[2].match(/\bid="([^"]+)"/)?.[1];
      const el = fid ? nodes.get(fid) : new Element(field[3], field[1]);
      if (field[1] === 'select') { el.innerHTML = field[4]; el.defaultValue = field[4].match(/<option value="([^"]+)" selected/)?.[1] ?? el.value; el.value = el.defaultValue; }
      form.elements[field[3]] = el;
    }
    // Inputs are void elements; parse independently of their following sibling.
    for (const field of m[2].matchAll(/<input\b[^>]*name="([^"]+)"[^>]*>/g)) form.elements[field[1]] ??= new Element(field[1], 'input');
  }
  const document = { getElementById: id => { assert.ok(nodes.has(id), `Missing actual HTML element ${id}`); return nodes.get(id); }, querySelectorAll: selector => selector === 'dialog' ? [...nodes.values()].filter(n => n.tag === 'dialog') : [], createElement: tag => new Element('', tag), body: { append() {} }, addEventListener() {} };
  const context = vm.createContext({ document, localStorage: { getItem(key) { assert.equal(key, KEY); if (storage.failRead) throw Error('denied'); return storage.value; }, setItem(key, value) { assert.equal(key, KEY); if (storage.failWrite) throw Error('quota'); storage.value = value; } },
    crypto: { randomUUID: () => `test-${++id}` }, Blob, URL: { createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; }, revokeObjectURL() {} },
    FormData: class { constructor(form) { this.form = form; } get(name) { return this.form.elements[name]?.value ?? null; } },
    confirm(message) { confirmations.push(message); return answer; }, setTimeout() { return 1; }, clearTimeout() {} });
  vm.runInContext(script, context, { filename: 'index.html:inline' });
  const $ = id => nodes.get(id);
  const data = () => JSON.parse(storage.value);
  const click = (container, attr, value) => $(container).emit('click', { target: { closest: selector => selector === `[data-${attr}]` ? { dataset: { [attr]: value } } : null } });
  const fields = (form, values) => { for (const [name, value] of Object.entries(values)) { assert.ok($(form).elements[name], `Missing ${form}.${name}`); $(form).elements[name].value = value; } };
  const importFile = input => $('importFile').emit('change', { target: Object.assign($('importFile'), { value: 'backup.json', files: [{ text: async () => typeof input === 'string' ? input : JSON.stringify(input) }] }) });
  return { $, data, click, fields, storage, downloads, blobs, confirmations, importFile, answer: value => { answer = value; }, async newCollection(name) { await $('addCollectionBtn').click(); fields('collectionForm', { title: name }); await $('collectionForm').emit('submit'); }, async newTrophy(values = {}) { await $('addTrophyBtn').click(); fields('trophyForm', { title: 'Новая цель', description: 'Описание', rarity: 'bronze', collection: 'general', ...values }); await $('trophyForm').emit('submit'); } };
}

test('UI renamed; MVP key and unchanged legacy saves remain readable without rewriting', () => {
  assert.match(html, /<title>NTrophia<\/title>/); assert.doesNotMatch(html, /NASIK TROPHIES/);
  const app = launch(legacy); assert.deepEqual(app.data(), legacy);
  assert.equal(app.$('earnedCount').textContent, 1); assert.equal(app.$('totalProgress').textContent, '100%');
  assert.match(app.$('trophyGrid').innerHTML, /Портфолио/);
});

test('collection and trophy creation, all rarities, filters and correct global statistics', async () => {
  const app = launch(); await app.newCollection('Учёба'); const collectionId = app.data().selectedCollection;
  for (const rarity of ['platinum', 'gold', 'silver', 'bronze']) await app.newTrophy({ title: rarity, rarity, collection: collectionId });
  assert.equal(app.data().collections.length, 2); assert.equal(app.data().trophies.length, 4);
  assert.equal(app.$('collectionCount').textContent, 2); assert.equal(app.$('allCount').textContent, 4);
  const trophyId = app.data().trophies[0].id; await app.click('trophyGrid', 'earn', trophyId);
  assert.equal(app.$('earnedCount').textContent, 1); assert.equal(app.$('totalProgress').textContent, '25%');
  await app.click('filters', 'filter', 'gold'); assert.equal(app.$('visibleCount').textContent, '1 трофей');
  assert.match(app.$('trophyGrid').innerHTML, /<h3>gold<\/h3>/); assert.equal(app.$('allCount').textContent, 4);
});

test('edit all four trophy fields without losing id, createdAt or earnedAt; cancel does nothing', async () => {
  const app = launch(legacy); await app.click('trophyGrid', 'edit', 'old');
  assert.equal(app.$('trophyForm').elements.title.value, 'Портфолио');
  assert.equal(app.$('trophyForm').elements.collection.value, 'general');
  assert.equal(app.$('trophyDialogTitle').textContent, 'Редактировать трофей');
  const before = app.storage.value;
  app.fields('trophyForm', { title: 'Не сохранять' }); app.$('trophyDialog').close(); assert.equal(app.storage.value, before);
  await app.click('trophyGrid', 'edit', 'old');
  app.fields('trophyForm', { title: 'Готовое портфолио', description: 'Обновлённое описание', rarity: 'gold', collection: 'languages' }); await app.$('trophyForm').emit('submit');
  assert.deepEqual(app.data().trophies[0], { ...legacy.trophies[0], title: 'Готовое портфолио', description: 'Обновлённое описание', rarity: 'gold', collectionId: 'languages' });
  assert.equal(app.$('trophyDialog').open, false);
});

test('earning and unearning survive a fresh application load', async () => {
  let app = launch(legacy); await app.click('trophyGrid', 'earn', 'old');
  assert.equal(app.data().trophies[0].earnedAt, null); assert.equal(app.$('totalProgress').textContent, '0%');
  app = launch(undefined, app.storage); assert.equal(app.$('earnedCount').textContent, 0);
  await app.click('trophyGrid', 'earn', 'old'); assert.ok(Date.parse(app.data().trophies[0].earnedAt));
  const again = launch(undefined, app.storage); assert.equal(again.$('earnedCount').textContent, 1); assert.match(again.$('trophyGrid').innerHTML, /Получен/);
});

test('trophy deletion respects confirmation and persists after reload', async () => {
  const app = launch(legacy); app.answer(false); await app.click('trophyGrid', 'delete', 'old'); assert.equal(app.data().trophies.length, 1);
  app.answer(true); await app.click('trophyGrid', 'delete', 'old');
  const again = launch(undefined, app.storage); assert.equal(again.data().trophies.length, 0); assert.equal(again.$('totalProgress').textContent, '0%');
});

test('collection deletion moves trophies with dates, preserves statistics and persists', async () => {
  const app = launch(legacy); await app.click('collectionList', 'collection', 'general'); await app.$('deleteCollectionBtn').click();
  const before = app.storage.value; app.$('deleteCollectionDialog').close(); assert.equal(app.storage.value, before);
  await app.$('deleteCollectionBtn').click(); app.$('moveCollectionSelect').value = 'languages'; await app.$('deleteCollectionForm').emit('submit');
  const again = launch(undefined, app.storage); assert.equal(again.data().collections.length, 1);
  assert.deepEqual(again.data().trophies[0], { ...legacy.trophies[0], collectionId: 'languages' });
  assert.equal(again.$('earnedCount').textContent, 1); assert.equal(again.$('totalProgress').textContent, '100%');
  await again.$('deleteCollectionBtn').click(); assert.equal(again.$('deleteCollectionDialog').open, false); assert.equal(again.data().collections.length, 1);
});

test('last empty collection can be deleted; creating a trophy requests a collection', async () => {
  const app = launch(); await app.click('collectionList', 'collection', 'general'); await app.$('deleteCollectionBtn').click(); await app.$('deleteCollectionForm').emit('submit');
  assert.deepEqual(app.data().collections, []); await app.$('addTrophyBtn').click(); assert.equal(app.$('collectionDialog').open, true);
  assert.equal(app.$('trophyDialog').open, false); await app.newCollection('С нуля'); assert.equal(app.data().collections.length, 1);
});

test('downloaded JSON restores full data; cancelled import leaves data byte-for-byte intact', async () => {
  const app = launch(legacy); await app.$('exportBtn').click();
  assert.equal(app.downloads.length, 1); assert.match(app.downloads[0].filename, /^NTrophia-.*\.json$/);
  const raw = await app.blobs.get(app.downloads[0].href).text(); const backup = JSON.parse(raw);
  assert.equal(backup.version, 1); assert.equal(backup.app, 'NTrophia'); assert.deepEqual(backup.data, legacy);
  await app.newTrophy(); const before = app.storage.value; app.answer(false); await app.importFile(raw); assert.equal(app.storage.value, before);
  app.answer(true); await app.importFile(raw); assert.deepEqual(app.data(), legacy);
  assert.deepEqual(launch(undefined, app.storage).data(), legacy); assert.equal(app.$('importBtn').disabled, false); assert.equal(app.$('importFile').value, '');
});

test('malformed JSON, duplicates, missing fields, bad dates, rarity and orphan trophies do not alter data', async () => {
  const bad = ['{', 'null', '[]', '{}', JSON.stringify({ app: 'NTrophia', version: 2, data: legacy })];
  const mutate = fn => { const value = copy(legacy); fn(value); bad.push(JSON.stringify(value)); };
  mutate(v => v.collections.push(v.collections[0])); mutate(v => v.trophies.push(v.trophies[0]));
  mutate(v => v.trophies[0].rarity = 'legendary'); mutate(v => v.trophies[0].rarity = '__proto__');
  mutate(v => v.trophies[0].collectionId = 'missing'); mutate(v => v.trophies[0].title = '  ');
  mutate(v => v.trophies[0].title = 'x'.repeat(91)); mutate(v => delete v.trophies[0].description);
  mutate(v => v.trophies[0].earnedAt = 'not-a-date'); mutate(v => v.trophies[0].createdAt = '2026-02-30T00:00:00.000Z');
  mutate(v => v.collections[0].id = 'all'); mutate(v => v.collections[0].name = 9);
  const app = launch(legacy); const before = app.storage.value;
  for (const input of bad) { await app.importFile(input); assert.equal(app.storage.value, before, input); assert.equal(app.$('storageNotice').hidden, false); assert.match(app.$('storageNotice').textContent, /Импорт отменён/); }
  assert.equal(app.confirmations.length, 0);
  await app.importFile(legacy); assert.deepEqual(app.data(), legacy); assert.equal(app.confirmations.length, 1);
});

test('untrusted imported text is escaped in HTML and unknown UI preferences fall back safely', async () => {
  const payload = copy(legacy); payload.trophies[0].title = '<img src=x onerror=alert(1)>'; payload.collections[0].name = '<svg onload=alert(1)>';
  payload.selectedCollection = 'missing'; payload.filter = 'unknown'; const app = launch(); await app.importFile(payload);
  assert.doesNotMatch(app.$('trophyGrid').innerHTML, /<img/); assert.match(app.$('trophyGrid').innerHTML, /&lt;img/);
  assert.doesNotMatch(app.$('collectionList').innerHTML, /<svg/); assert.equal(app.data().selectedCollection, 'all'); assert.equal(app.data().filter, 'all');
});

test('storage write failures leave earned status, edits, deletions, imports and visible statistics unchanged', async () => {
  const app = launch(legacy); const before = app.storage.value; app.storage.failWrite = true;
  await app.click('trophyGrid', 'earn', 'old'); assert.equal(app.storage.value, before); assert.equal(app.$('earnedCount').textContent, 1);
  await app.click('trophyGrid', 'edit', 'old'); app.fields('trophyForm', { title: 'Изменение' }); await app.$('trophyForm').emit('submit'); assert.equal(app.$('trophyDialog').open, true);
  await app.click('trophyGrid', 'delete', 'old'); await app.newCollection('Не сохранится');
  await app.importFile({ collections: [], trophies: [] }); assert.equal(app.storage.value, before); assert.equal(app.$('earnedCount').textContent, 1);
  assert.equal(app.$('storageNotice').hidden, false); assert.match(app.$('storageNotice').textContent, /Не удалось сохранить/);
  app.storage.failWrite = false; await app.importFile(legacy); assert.equal(app.$('storageNotice').hidden, true);
});

test('corrupt legacy save is preserved and locked against accidental overwrite, valid import recovers', async () => {
  const app = launch('{broken'); assert.equal(app.storage.value, '{broken'); await app.newCollection('Не затереть'); assert.equal(app.storage.value, '{broken');
  await app.$('exportBtn').click(); assert.equal(app.downloads.length, 0);
  await app.importFile(legacy); assert.deepEqual(app.data(), legacy); assert.equal(app.$('storageNotice').hidden, true);
});
