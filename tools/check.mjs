#!/usr/bin/env node
/**
 * Headless check for dsh-aurora-theme's browser half.
 *
 * No real DOM and no real React: a minimal document plus a hook-aware React
 * stub is enough to prove the wiring that actually breaks — bundle contract,
 * two slot registrations, locale dictionaries, the persisted store, body
 * attributes, and teardown. Visual correctness is not testable here.
 *
 * Run: node tools/check.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = fileURLToPath(new URL('.', import.meta.url))
const source = readFileSync(here + '../client.js', 'utf8')

/* ---------------------------------------------------------------- DOM ---- */

class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase()
    this.children = []
    this.parentNode = null
    this.attributes = new Map()
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, String(value)),
      removeProperty: (name) => this.style.values.delete(name),
      getPropertyValue: (name) => this.style.values.get(name) ?? '',
    }
    this.id = ''
    this.innerHTML = ''
    this.width = 0
    this.height = 0
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
    if (name === 'id') this.id = String(value)
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name) {
    return this.attributes.has(name)
  }

  removeAttribute(name) {
    this.attributes.delete(name)
  }

  appendChild(child) {
    child.parentNode = this
    this.children.push(child)
    return child
  }

  remove() {
    if (this.parentNode === null) return
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this)
    this.parentNode = null
  }

  querySelector(selector) {
    if (selector === 'canvas') {
      this._canvas ??= new Element('canvas')
      return this._canvas
    }
    return null
  }

  getContext() {
    const noop = () => {}
    return {
      setTransform: noop,
      clearRect: noop,
      beginPath: noop,
      arc: noop,
      fill: noop,
      globalAlpha: 1,
      fillStyle: '',
    }
  }

  addEventListener() {}
  removeEventListener() {}
}

function walk(node, visit) {
  visit(node)
  for (const child of node.children) walk(child, visit)
}

function createDocument() {
  const head = new Element('head')
  const body = new Element('body')
  const html = new Element('html')
  head.parentNode = html
  html.children.push(head)
  body.parentNode = html
  html.children.push(body)

  return {
    head,
    body,
    documentElement: html,
    hidden: false,
    createElement: (tag) => new Element(tag),
    getElementById(id) {
      let found = null
      walk(html, (node) => {
        if (found === null && node.id === id) found = node
      })
      return found
    },
    addEventListener() {},
    removeEventListener() {},
  }
}

function createLocalStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _dump: () => Object.fromEntries(map),
  }
}

/* -------------------------------------------------------------- React ---- */

function createReact() {
  const hooks = { cursor: 0, states: [], effects: [] }

  const React = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity) }
    },
    useState(initial) {
      const index = hooks.cursor++
      if (!(index in hooks.states)) {
        hooks.states[index] = typeof initial === 'function' ? initial() : initial
      }
      return [
        hooks.states[index],
        (value) => {
          hooks.states[index] = typeof value === 'function' ? value(hooks.states[index]) : value
        },
      ]
    },
    useEffect(effect) {
      hooks.effects.push(effect)
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
    useMemo(factory) {
      return factory()
    },
    useCallback(fn) {
      return fn
    },
  }

  return {
    React,
    reset() {
      hooks.cursor = 0
      hooks.states = []
      hooks.effects = []
    },
    render(Component, props = {}) {
      hooks.cursor = 0
      hooks.states = []
      hooks.effects = []
      const tree = Component(props)
      for (const effect of hooks.effects) effect()
      return tree
    },
  }
}

/* ------------------------------------------------------------- harness --- */

function boot({ detectLocale = true, navigatorLanguage = 'zh-CN', storage = {} } = {}) {
  const document = createDocument()
  const localStorage = createLocalStorage(storage)
  let loaded = null
  let rafId = 0

  const window = {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    localStorage,
    addEventListener() {},
    removeEventListener() {},
    __ModuleLoader__: {
      load(entry) {
        loaded = entry
      },
    },
  }

  const sandbox = {
    window,
    document,
    navigator: { language: navigatorLanguage },
    console: { warn() {}, info() {}, error: console.error },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: () => ++rafId,
    cancelAnimationFrame: () => {},
    Math,
    JSON,
  }

  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  assert.ok(loaded, 'client.js must call window.__ModuleLoader__.load')

  const react = createReact()
  const plugin = loaded.factory((specifier) => {
    assert.equal(specifier, 'react', 'only the shared react module may be required')
    return react.React
  })

  return { document, localStorage, window, loaded, plugin, react, detectLocale }
}

function makeContext({ detectLocale = true } = {}) {
  const registrations = []
  const disposers = []
  const dictionaries = []
  const locale = {
    register(namespace, dict) {
      dictionaries.push({ namespace, dict })
      return () => {}
    },
    bind(namespace) {
      const entry = dictionaries.find((item) => item.namespace === namespace)
      return (key) => entry?.dict.zh?.[key] ?? key
    },
  }

  const ctx = {
    effect(setup) {
      const dispose = setup()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
    inject(deps, callback) {
      if (detectLocale && deps.includes('locale')) {
        callback({
          locale,
          effect(setup) {
            const dispose = setup()
            if (typeof dispose === 'function') disposers.push(dispose)
            return dispose
          },
        })
      }
    },
    slots: {
      inject(key, callback) {
        callback()
      },
      register(options, Component) {
        registrations.push({ options, Component })
        return () => {
          const index = registrations.findIndex((item) => item.options === options)
          if (index >= 0) registrations.splice(index, 1)
        }
      },
    },
  }

  return { ctx, registrations, disposers, dictionaries, locale }
}

function expand(node) {
  // The stub renderer does not mount nested function components the way React
  // does, so expand the few hook-free ones (toggle rows) on demand.
  if (node !== null && typeof node === 'object' && typeof node.type === 'function') {
    return expand(node.type(node.props))
  }
  return node
}

function findButtons(node, out = []) {
  node = expand(node)
  if (node === null || typeof node !== 'object') return out
  if (node.type === 'button') out.push(node)
  for (const child of node.children ?? []) findButtons(child, out)
  return out
}

function textOf(node) {
  node = expand(node)
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return textOf(node.children)
}

/* ---------------------------------------------------------------- tests -- */

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}`)
    throw error
  }
}

console.log('dsh-aurora-theme client check')

test('bundle contract: id, plugin shape, slots dependency', () => {
  const { loaded, plugin } = boot()
  assert.equal(loaded.id, 'dsh-aurora-theme')
  assert.equal(typeof loaded.factory, 'function')
  assert.equal(plugin.name, 'dsh-aurora-theme')
  assert.deepEqual([...plugin.inject], ['slots'])
  assert.equal(typeof plugin.apply, 'function')
})

test('apply: registers two slots with matching id/key and installs the layer', () => {
  const { document, plugin } = boot()
  const { ctx, registrations, dictionaries } = makeContext()
  plugin.apply(ctx)

  assert.equal(registrations.length, 2)
  const sidebar = registrations.find((item) => item.options.name === 'sidebar.panellist')
  const main = registrations.find((item) => item.options.name === 'main')
  assert.ok(sidebar, 'sidebar.panellist must be registered')
  assert.ok(main, 'main must be registered')
  assert.equal(sidebar.options.id, 'aurora-theme')
  assert.equal(main.options.key, 'aurora-theme')
  assert.equal(sidebar.options.order, 20)
  assert.equal(sidebar.options.label(), '皮肤')
  assert.equal(typeof sidebar.Component, 'function')
  assert.equal(typeof main.Component, 'function')

  assert.equal(dictionaries.length, 1)
  assert.equal(dictionaries[0].namespace, 'auroraTheme')
  assert.ok(dictionaries[0].dict.zh.panel)
  assert.ok(dictionaries[0].dict.en.panel)

  assert.ok(document.getElementById('dsh-aurora-style'), 'style tag must be installed')
  assert.ok(document.getElementById('dsh-aurora-layer'), 'backdrop layer must be installed')
  assert.equal(document.body.getAttribute('data-aurora-on'), '1')
  assert.equal(document.body.getAttribute('data-aurora-skin'), 'aurora')
  assert.equal(document.body.getAttribute('data-aurora-glass'), '1')
})

test('page renders palettes and effects in the active language', () => {
  const { document, plugin, react } = boot()
  const { ctx, registrations } = makeContext()
  plugin.apply(ctx)
  const main = registrations.find((item) => item.options.name === 'main')
  const tree = react.render(main.Component)
  const text = textOf(tree)
  assert.match(text, /皮肤/)
  assert.match(text, /配色/)
  assert.match(text, /效果/)
  assert.match(text, /玻璃/)
  const buttons = findButtons(tree)
  assert.ok(buttons.length >= 4, 'three palettes plus toggles and reset')
})

test('choosing a palette persists and updates the installed layer', () => {
  const { document, localStorage, plugin, react } = boot()
  const { ctx, registrations } = makeContext()
  plugin.apply(ctx)
  const main = registrations.find((item) => item.options.name === 'main')
  const tree = react.render(main.Component)
  const buttons = findButtons(tree)
  const ember = buttons.find((button) => textOf(button).includes('余烬'))
  assert.ok(ember, 'ember palette card must exist')
  ember.props.onClick()

  assert.equal(document.body.getAttribute('data-aurora-skin'), 'ember')
  assert.equal(JSON.parse(localStorage.getItem('dsh-aurora-theme/v1')).skin, 'ember')
})

test('toggling an effect flips the body attribute and persists', () => {
  const { document, localStorage, plugin, react } = boot()
  const { ctx, registrations } = makeContext()
  plugin.apply(ctx)
  const main = registrations.find((item) => item.options.name === 'main')
  const switches = findButtons(react.render(main.Component)).filter((button) => button.props.role === 'switch')
  assert.equal(switches.length, 7)
  const glass = switches.find((button) => button.props['aria-label'] === '玻璃')
  glass.props.onClick()
  assert.equal(document.body.getAttribute('data-aurora-glass'), '0')
  assert.equal(JSON.parse(localStorage.getItem('dsh-aurora-theme/v1')).glass, false)
})

test('state survives a reload', () => {
  const first = boot()
  const firstCtx = makeContext()
  first.plugin.apply(firstCtx.ctx)
  const main = firstCtx.registrations.find((item) => item.options.name === 'main')
  const ember = findButtons(first.react.render(main.Component)).find((button) => textOf(button).includes('余烬'))
  ember.props.onClick()
  const saved = first.localStorage._dump()

  const second = boot({ storage: saved })
  const secondCtx = makeContext()
  second.plugin.apply(secondCtx.ctx)
  assert.equal(second.document.body.getAttribute('data-aurora-skin'), 'ember')
})

test('missing locale service degrades to the browser language instead of breaking', () => {
  const { document, plugin, react } = boot({ detectLocale: false })
  const { ctx, registrations, dictionaries } = makeContext({ detectLocale: false })
  plugin.apply(ctx)
  assert.equal(dictionaries.length, 0)
  assert.equal(registrations.length, 2, 'slots still register without locale')
  const main = registrations.find((item) => item.options.name === 'main')
  const text = textOf(react.render(main.Component))
  assert.match(text, /皮肤/)
  assert.equal(document.body.getAttribute('data-aurora-on'), '1')
})

test('teardown removes layer, style, body attributes and the store subscription', () => {
  const { document, plugin } = boot()
  const { ctx, disposers } = makeContext()
  plugin.apply(ctx)
  // install cleanup first, then the locale dictionary disposer
  assert.equal(disposers.length, 2)
  disposers[0]()
  assert.equal(document.getElementById('dsh-aurora-layer'), null)
  assert.equal(document.getElementById('dsh-aurora-style'), null)
  for (const name of ['data-aurora-on', 'data-aurora-skin', 'data-aurora-glass']) {
    assert.equal(document.body.hasAttribute(name), false, `${name} must be cleared`)
  }
})

test('a second apply replaces the previous layer instead of stacking one', () => {
  const { document, plugin } = boot()
  plugin.apply(makeContext().ctx)
  plugin.apply(makeContext().ctx)
  let layers = 0
  walk(document.body, (node) => {
    if (node.id === 'dsh-aurora-layer') layers += 1
  })
  assert.equal(layers, 1)
})

console.log(`\n${passed} checks passed`)
