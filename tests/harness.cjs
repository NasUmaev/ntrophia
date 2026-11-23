const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const KEY = 'nasik-trophies-v1';
const BACKUP_KEY = 'nasik-trophies-v1-before-iteration-2';
const timestamp = '2026-11-23T12:00:00.000Z';
const legacy = {
  collections: [{ id: 'general', name: 'Старые цели', createdAt: timestamp }, { id: 'languages', name: 'Языки', createdAt: timestamp }],
  trophies: [{ id: 'old', title: 'Портфолио', description: 'Первая версия', rarity: 'gold', collectionId: 'general', earnedAt: timestamp, createdAt: timestamp }],
  selectedCollection: 'all', filter: 'all'
};
const copy = value => JSON.parse(JSON.stringify(value));

// Minimal DOM adapter: executes the real inline script and its registered handlers.
// Browser layout, native dialogs and file pickers are intentionally outside this harness.
let run = 0;
function launch(initial, storage = { value: initial === undefined ? null : typeof initial === 'string' ? initial : JSON.stringify(initial) }) {
  const nodes = new Map(); const confirmations = [], downloads = [], blobs = new Map();
  let answer = true, id = 0, now = '2026-11-23T15:00:00.000Z'; const instance = ++run;
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return Date.parse(now); } }
  class Element {
    constructor(name, tag = '') { this.id = name; this.tag = tag; this.value = ''; this.textContent = ''; this.hidden = false; this.open = false; this.style = {}; this.checked = false; this.type = ''; this.files = []; this.listeners = {}; this.classList = { add() {}, remove() {} }; }
    set innerHTML(value) { this.markup = value; if (this.tag === 'select') this.value = value.match(/<option value="([^"]*)"/)?.[1] ?? ''; }
    get innerHTML() { return this.markup ?? ''; }
    addEventListener(event, callback) { (this.listeners[event] ??= []).push(callback); }
    async emit(type, options = {}) { const event = { target: this, currentTarget: this, preventDefault() {}, ...options }; for (const callback of this.listeners[type] ?? []) await callback(event); }
    click() { if (this.tag === 'a') downloads.push({ href: this.href, filename: this.download }); return this.emit('click'); }
    focus() {} remove() {} showModal() { this.open = true; } close() { this.open = false; }
    reset() { for (const field of Object.values(this.elements ?? {})) { field.value = field.defaultValue ?? ''; field.checked = false; } }
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
    for (const field of m[2].matchAll(/<input\b[^>]*name="([^"]+)"[^>]*>/g)) { const el = form.elements[field[1]] ??= new Element(field[1], 'input'); el.type = field[0].match(/type="([^"]+)"/)?.[1] || 'text'; }
  }
  const document = { getElementById: id => { assert.ok(nodes.has(id), `Missing actual HTML element ${id}`); return nodes.get(id); }, querySelectorAll: selector => selector === 'dialog' ? [...nodes.values()].filter(n => n.tag === 'dialog') : [], createElement: tag => new Element('', tag), body: { append() {} }, addEventListener() {} };
  const context = vm.createContext({ document, localStorage: { getItem(key) { assert.ok([KEY, BACKUP_KEY].includes(key)); if (storage.failRead) throw Error('denied'); return key === KEY ? storage.value : storage.backup ?? null; }, setItem(key, value) { assert.ok([KEY, BACKUP_KEY].includes(key)); if (storage.failWrite) throw Error('quota'); if (key === KEY) storage.value = value; else storage.backup = value; } },
    Date: ClockDate, crypto: { randomUUID: () => `test-${instance}-${++id}` }, Blob, URL: { createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; }, revokeObjectURL() {} },
    FormData: class { constructor(form) { this.form = form; } get(name) { const field = this.form.elements[name]; return field?.type === 'checkbox' ? (field.checked ? 'on' : null) : field?.value ?? null; } },
    confirm(message) { confirmations.push(message); return answer; }, setTimeout() { return 1; }, clearTimeout() {} });
  vm.runInContext(script, context, { filename: 'index.html:inline' });
  const $ = id => nodes.get(id);
  const data = () => JSON.parse(storage.value);
  const click = (container, attr, value) => $(container).emit('click', { target: { closest: selector => selector === `[data-${attr}]` ? { dataset: { [attr]: value } } : null } });
  const fields = (form, values) => { for (const [name, value] of Object.entries(values)) { assert.ok($(form).elements[name], `Missing ${form}.${name}`); const field = $(form).elements[name]; if (field.type === 'checkbox') field.checked = value; else field.value = value; } };
  const importFile = input => $('importFile').emit('change', { target: Object.assign($('importFile'), { value: 'backup.json', files: [{ text: async () => typeof input === 'string' ? input : JSON.stringify(input) }] }) });
  return { $, data, click, fields, storage, time: value => { now = value; }, open: collectionId => click('collectionList', 'collection', collectionId), downloads, blobs, confirmations, importFile, answer: value => { answer = value; }, async newCollection(name, description = '') { await $('addCollectionBtn').click(); fields('collectionForm', { title: name, description }); await $('collectionForm').emit('submit'); }, async newTrophy(values = {}) { await $('addTrophyBtn').click(); fields('trophyForm', { title: 'Новая цель', description: 'Описание', rarity: 'bronze', collection: 'general', ...values }); await $('trophyForm').emit('submit'); } };
}


module.exports = { launch, legacy, copy, timestamp, html, KEY, BACKUP_KEY };
