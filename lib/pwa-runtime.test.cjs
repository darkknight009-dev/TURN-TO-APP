'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('next/dist/build/swc');

// Execute the real component's hooks and event handlers with browser signals
// simulated. This does not pretend to exercise Brave's native install dialog.
const source = fs.readFileSync(path.join(__dirname, '../app/pwa/[id]/PwaRuntime.jsx'), 'utf8');
const { code } = transformSync(source, {
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
  module: { type: 'commonjs' },
});

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map((child) => findNode(child, predicate)).find(Boolean);
  return predicate(node) ? node : findNode(node.props?.children, predicate);
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ');
  return typeof node === 'string' ? node : node && typeof node === 'object' ? text(node.props?.children) : '';
}

function mount({ standalone = false, iconUnavailable = false, animatedIcon = false } = {}) {
  const cells = [];
  let cursor = 0;
  let effects = [];
  const listeners = {};
  const registrations = [];
  const navigations = [];
  const targetUrl = 'http://example.com/products?view=mobile#details';
  const navigator = { serviceWorker: { register: async (...args) => { registrations.push(args); } } };
  const window = {
    navigator,
    location: {
      origin: 'https://converter.example',
      replace: (url) => navigations.push(['replace', url]),
      assign: (url) => navigations.push(['assign', url]),
    },
    matchMedia: (query) => ({ matches: query === '(display-mode: standalone)' && standalone }),
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: (name) => { delete listeners[name]; },
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
      return [cells[index], (next) => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      return cells[index] ||= { current: initial };
    },
    useMemo: (fn) => fn(),
    useLayoutEffect: () => {},
    useEffect(fn, dependencies) {
      const index = cursor++;
      const previous = cells[index];
      if (!previous || dependencies.some((value, i) => value !== previous[i])) {
        cells[index] = dependencies;
        effects.push(fn);
      }
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, window, navigator,
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'gsap') return { gsap: {} };
      if (name.endsWith('.module.css')) return {};
      throw new Error(`Unexpected runtime dependency: ${name}`);
    },
  });
  function render() {
    cursor = 0;
    const tree = module.exports.default({ id: 'runtime-test', appName: 'Runtime Test', targetUrl, state: 'token', iconUnavailable, animatedIcon });
    const pending = effects;
    effects = [];
    pending.forEach((effect) => effect());
    return tree;
  }
  render();
  return {
    render, listeners, registrations, navigations, targetUrl,
    primary: () => findNode(render(), (node) => node.type === 'button' && node.props['aria-describedby'] === 'install-status'),
  };
}

test('standalone launches the exact original URL directly and registers the canonical scope', () => {
  const app = mount({ standalone: true });
  assert.deepEqual(app.navigations, [['replace', app.targetUrl]]);
  assert.equal(app.registrations[0][1].scope, '/pwa/runtime-test');
  assert.equal(app.primary().props.disabled, false);
  assert.match(text(app.primary()), /Open app/);
});

test('appinstalled leaves an enabled repeatable Open app action without popup duplication', async () => {
  const app = mount();
  app.listeners.appinstalled();
  await app.primary().props.onClick();
  await app.primary().props.onClick();
  assert.equal(app.primary().props.disabled, false);
  assert.deepEqual(app.navigations, [['assign', app.targetUrl], ['assign', app.targetUrl]]);
});

test('dismissal or a prompt error does not block a later native install event', async () => {
  for (const fail of [false, true]) {
    const app = mount();
    let prompts = 0;
    app.listeners.beforeinstallprompt({
      preventDefault() {},
      prompt: async () => { prompts += 1; if (fail) throw new Error('prompt failed'); },
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    const click = app.primary().props.onClick;
    await Promise.all([click(), click()]);
    assert.equal(prompts, 1, 'A native prompt event is single-use');
    assert.equal(app.primary().props.disabled, false);
    app.listeners.beforeinstallprompt({
      preventDefault() {},
      prompt: async () => { prompts += 1; },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    await app.primary().props.onClick();
    assert.equal(prompts, 2);
    assert.match(text(app.render()), /Install request accepted/);
    app.listeners.appinstalled();
    assert.match(text(app.primary()), /Open app/);
  }
});

test('appinstalled arriving before userChoice is not overwritten as unavailable', async () => {
  const app = mount();
  app.listeners.beforeinstallprompt({
    preventDefault() {},
    prompt: async () => app.listeners.appinstalled(),
    userChoice: Promise.resolve({ outcome: 'dismissed' }),
  });
  await app.primary().props.onClick();
  assert.match(text(app.primary()), /Open app/);
});

test('missing uploaded artwork cannot trigger an install with the wrong icon', async () => {
  const app = mount({ iconUnavailable: true });
  let prompted = false;
  app.listeners.beforeinstallprompt({ preventDefault() {}, prompt: () => { prompted = true; } });
  await app.primary().props.onClick();
  assert.equal(prompted, false);
  assert.match(text(app.render()), /uploaded icon is unavailable/);
});

test('animated install-page artwork respects reduced motion and keeps PNG fallback', () => {
  const app = mount({ animatedIcon: true });
  const source = findNode(app.render(), (node) => node.type === 'source');
  assert.equal(source.props.type, 'image/gif');
  assert.equal(source.props.media, '(prefers-reduced-motion: no-preference)');
  assert.match(source.props.srcSet, /animated=1/);
  const image = findNode(app.render(), (node) => node.type === 'img');
  assert.match(image.props.src, /size=192/);
});
