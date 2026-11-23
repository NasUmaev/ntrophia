const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const KEY = 'nasik-trophies-v1';
const BACKUP_KEY = 'nasik-trophies-v1-before-iteration-2';
const PREFERENCES_KEY = 'ntrophia-preferences-v1';
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
function launch(initial, storage = { value: initial === undefined ? null : typeof initial === 'string' ? initial : JSON.stringify(initial) }, environment = {}) {
  const nodes = new Map(); const confirmations = [], downloads = [], blobs = new Map(), timers = new Map(); let timerId = 0, timerTime = 0;
  const audio = { contexts: [], oscillators: [], resumes: [], pending: [] };
  let answer = true, id = 0, now = '2026-11-23T15:00:00.000Z'; const instance = ++run;
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return Date.parse(now); } }
  class Element {
    constructor(name, tag = '') { this.id = name; this.tag = tag; this.value = ''; this.textContent = ''; this.hidden = false; this.open = false; this.style = {}; this.checked = false; this.type = ''; this.files = []; this.listeners = {}; this.attributes = {}; const classes = new Set(); this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) }; }
    set innerHTML(value) { this.markup = value; if (this.tag === 'select') this.value = value.match(/<option value="([^"]*)"/)?.[1] ?? ''; }
    get innerHTML() { return this.markup ?? ''; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener(event, callback) { (this.listeners[event] ??= []).push(callback); }
    async emit(type, options = {}) { const event = { isTrusted: false, target: this, currentTarget: this, preventDefault() {}, ...options }; for (const callback of this.listeners[type] ?? []) await callback(event); }
    click() { if (this.tag === 'a') downloads.push({ href: this.href, filename: this.download }); return this.emit('click'); }
    focus() {} remove() {} showModal() { this.open = true; } close() { this.open = false; }
    reset() { for (const field of Object.values(this.elements ?? {})) { field.value = field.defaultValue ?? ''; field.checked = false; } }
    getBoundingClientRect() { return { left: 0, top: 0, right: 400, bottom: 400 }; }
  }
  for (const m of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) { const el = new Element(m[2], m[1]); el.hidden = /\bhidden(?:\s|>)/.test(m[0]); nodes.set(m[2], el); }
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
  class MockAudioContext {
    constructor() { this.state = environment.audioState || 'suspended'; this.currentTime = 0; this.destination = {}; audio.contexts.push(this); }
    resume() { audio.resumes.push(this); if (environment.resume === 'reject') return Promise.reject(Error('denied')); if (environment.resume === 'delayed') return new Promise(resolve => audio.pending.push(() => { this.state = 'running'; resolve(); })); this.state = environment.resume === 'suspend' ? 'suspended' : 'running'; return Promise.resolve(); }
    createOscillator() { const o = { frequency: { setValueAtTime(value) { o.frequencyValue = value; } }, connect() {}, disconnect() {}, start(time) { o.startTime = time; }, stop(time) { (o.stopCalls ??= []).push(time); } }; audio.oscillators.push(o); return o; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  const context = vm.createContext({ navigator: { userActivation: { isActive: environment.activation !== false } }, ...(environment.audio ? { AudioContext: MockAudioContext } : {}), document, localStorage: { getItem(key) { assert.ok([KEY, BACKUP_KEY, PREFERENCES_KEY].includes(key)); if (storage.failRead) throw Error('denied'); return key === KEY ? storage.value : key === BACKUP_KEY ? storage.backup ?? null : storage.preferences ?? null; }, setItem(key, value) { assert.ok([KEY, BACKUP_KEY, PREFERENCES_KEY].includes(key)); if (storage.failWrite) throw Error('quota'); if (key === KEY) storage.value = value; else if (key === BACKUP_KEY) storage.backup = value; else storage.preferences = value; } },
    Date: ClockDate, crypto: { randomUUID: () => `test-${instance}-${++id}` }, Blob, URL: { createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; }, revokeObjectURL() {} },
    FormData: class { constructor(form) { this.form = form; } get(name) { const field = this.form.elements[name]; return field?.type === 'checkbox' ? (field.checked ? 'on' : null) : field?.value ?? null; } },
    confirm(message) { confirmations.push(message); return answer; }, setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, at: timerTime + delay }); return id; }, clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(script, context, { filename: 'index.html:inline' });
  const $ = id => nodes.get(id);
  const data = () => JSON.parse(storage.value);
  const click = (container, attr, value, options = {}) => $(container).emit('click', { target: { closest: selector => selector === `[data-${attr}]` ? { dataset: { [attr]: value } } : null }, ...options });
  const fields = (form, values) => { for (const [name, value] of Object.entries(values)) { assert.ok($(form).elements[name], `Missing ${form}.${name}`); const field = $(form).elements[name]; if (field.type === 'checkbox') field.checked = value; else field.value = value; } };
  const importFile = input => $('importFile').emit('change', { target: Object.assign($('importFile'), { value: 'backup.json', files: [{ text: async () => typeof input === 'string' ? input : JSON.stringify(input) }] }) });
  const advance = ms => { const end = timerTime + ms; while (true) { const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0]; if (!next) break; timerTime = next[1].at; timers.delete(next[0]); next[1].callback(); } timerTime = end; };
  return { $, data, click, fields, storage, audio, timers, advance, time: value => { now = value; }, open: collectionId => click('collectionList', 'collection', collectionId), downloads, blobs, confirmations, importFile, answer: value => { answer = value; }, async newCollection(name, description = '') { await $('addCollectionBtn').click(); fields('collectionForm', { title: name, description }); await $('collectionForm').emit('submit'); }, async newTrophy(values = {}) { await $('addTrophyBtn').click(); fields('trophyForm', { title: 'Новая цель', description: 'Описание', rarity: 'bronze', collection: 'general', ...values }); await $('trophyForm').emit('submit'); } };
}


module.exports = { launch, legacy, copy, timestamp, html, KEY, BACKUP_KEY, PREFERENCES_KEY };
