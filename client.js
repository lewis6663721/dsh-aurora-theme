/**
 * Browser half of `dsh-aurora-theme`.
 *
 * Contract: a classic script (no import/export) that calls
 * `window.__ModuleLoader__.load` once. `factory` runs lazily and returns an
 * ordinary Cordis plugin; the shell starts it once the `slots` service exists.
 *
 * Layout of this file:
 *   1. constants, palettes, dictionaries
 *   2. a tiny persisted store (localStorage; per browser by design)
 *   3. background layer install/teardown (style, DOM, attributes, rAF)
 *   4. the skin page and its sidebar entry
 *   5. apply(ctx): install + locale + two slot registrations
 */
window.__ModuleLoader__.load({
  id: 'dsh-aurora-theme',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NAME = 'dsh-aurora-theme'
    /** Main-panel key and sidebar entry id; they must match. */
    const PANEL_ID = 'aurora-theme'
    /** Locale namespace for this plugin's dictionaries. */
    const NS = 'auroraTheme'
    const STORAGE_KEY = 'dsh-aurora-theme/v1'
    const LEGACY_KEYS = ['dsh-aurora-theme', 'aurora-theme']
    const LAYER_ID = 'dsh-aurora-layer'
    const STYLE_ID = 'dsh-aurora-style'

    /** Toggle order on the page; each key becomes `data-aurora-<key>`. */
    const TOGGLES = ['glow', 'motes', 'grain', 'parallax', 'breathe', 'sweep', 'glass']

    const SKINS = [
      {
        id: 'aurora',
        dark: { bg: '#05080f', a1: '#48f0c0', a2: '#4f7cff', a3: '#b45cff', a4: '#ff5ea8' },
        light: { bg: '#eef4fb', a1: '#0f9f7a', a2: '#2f5be0', a3: '#8a3ff0', a4: '#e02f7a' },
      },
      {
        id: 'ember',
        dark: { bg: '#0d0709', a1: '#ffb347', a2: '#ff5e7a', a3: '#a855f7', a4: '#ff8a3d' },
        light: { bg: '#fdf1ea', a1: '#c96a00', a2: '#d02f4f', a3: '#7c3aed', a4: '#d97706' },
      },
      {
        id: 'mint',
        dark: { bg: '#04100d', a1: '#9bffcf', a2: '#2fbf8f', a3: '#3aa7c9', a4: '#7de2ff' },
        light: { bg: '#eefaf4', a1: '#0f8f63', a2: '#0e7a5f', a3: '#0e7490', a4: '#0891b2' },
      },
    ]

    const DEFAULT_STATE = { skin: 'aurora', glow: true, motes: true, grain: true, parallax: true, breathe: true, sweep: true, glass: true }

    const ZH = {
      panel: '皮肤',
      title: '皮肤',
      intro: '一层垫在界面之下的动态背景，加上一套半透明的表面 token。皮肤只改变观感，不改变任何功能。',
      palette: '配色',
      effects: '效果',
      'skin.aurora': '极光',
      'skin.aurora.desc': '青绿 · 靛蓝 · 品红',
      'skin.ember': '余烬',
      'skin.ember.desc': '琥珀 · 玫红 · 紫',
      'skin.mint': '薄荷',
      'skin.mint.desc': '薄荷 · 松绿 · 湖蓝',
      glow: '光晕',
      'glow.desc': '背景里的极光色团',
      motes: '尘埃',
      'motes.desc': '缓慢上浮的细小光点',
      grain: '噪点',
      'grain.desc': '低透明度的胶片颗粒',
      parallax: '视差',
      'parallax.desc': '色团随指针轻微移动',
      breathe: '呼吸',
      'breathe.desc': '色团缓慢缩放与明暗变化',
      sweep: '扫光',
      'sweep.desc': '周期性掠过的高光带',
      glass: '玻璃',
      'glass.desc': '半透明表面与磨砂面板',
      reset: '恢复默认',
      active: '当前',
      on: '开',
      off: '关',
      note: '设置只保存在本浏览器，换设备或换浏览器不会跟随。',
    }

    const EN = {
      panel: 'Skin',
      title: 'Skin',
      intro: 'An animated backdrop behind the interface plus a translucent surface token set. It changes how DSH looks, never what it does.',
      palette: 'Palette',
      effects: 'Effects',
      'skin.aurora': 'Aurora',
      'skin.aurora.desc': 'Teal · indigo · magenta',
      'skin.ember': 'Ember',
      'skin.ember.desc': 'Amber · rose · violet',
      'skin.mint': 'Mint',
      'skin.mint.desc': 'Mint · pine · lagoon',
      glow: 'Glow',
      'glow.desc': 'The aurora blobs behind everything',
      motes: 'Motes',
      'motes.desc': 'Small light points drifting upward',
      grain: 'Grain',
      'grain.desc': 'Low-opacity film grain',
      parallax: 'Parallax',
      'parallax.desc': 'Blobs follow the pointer slightly',
      breathe: 'Breathe',
      'breathe.desc': 'Slow scale and opacity pulsing',
      sweep: 'Sweep',
      'sweep.desc': 'A highlight band crossing periodically',
      glass: 'Glass',
      'glass.desc': 'Translucent surfaces and a frosted page',
      reset: 'Reset',
      active: 'Active',
      on: 'On',
      off: 'Off',
      note: 'Saved in this browser only; another device or browser starts fresh.',
    }

    // The locale service may arrive after the page is registered; until it
    // binds, fall back to the browser's language rather than showing keys.
    const prefersZh = typeof navigator === 'undefined' || !navigator.language || navigator.language.toLowerCase().startsWith('zh')
    let translate = (key) => (prefersZh ? ZH : EN)[key] ?? key

    /* ------------------------------------------------------------------ */
    /* store                                                              */
    /* ------------------------------------------------------------------ */

    function normalize(raw) {
      const state = { ...DEFAULT_STATE }
      if (raw === null || typeof raw !== 'object') return state
      if (SKINS.some((skin) => skin.id === raw.skin)) state.skin = raw.skin
      for (const key of TOGGLES) if (typeof raw[key] === 'boolean') state[key] = raw[key]
      return state
    }

    function readState() {
      try {
        for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
          const text = window.localStorage.getItem(key)
          if (text === null || text === '') continue
          return normalize(JSON.parse(text))
        }
      } catch {
        // Private mode, disabled storage, or a corrupt legacy value: defaults.
      }
      return { ...DEFAULT_STATE }
    }

    function persist(state) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        // A skin is not worth breaking the page over.
      }
    }

    function createStore() {
      let state = readState()
      const listeners = new Set()
      const emit = () => {
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch (error) {
            console.warn('aurora-theme: store listener failed', error)
          }
        }
      }
      return {
        get() {
          return state
        },
        set(patch) {
          const next = normalize({ ...state, ...patch })
          if (JSON.stringify(next) === JSON.stringify(state)) return
          state = next
          persist(state)
          emit()
        },
        reset() {
          this.set({ ...DEFAULT_STATE })
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    const store = createStore()

    function useSkin() {
      return React.useSyncExternalStore(store.subscribe, store.get)
    }

    /* ------------------------------------------------------------------ */
    /* background layer                                                   */
    /* ------------------------------------------------------------------ */

    const BODY_ATTRS = ['data-aurora-on', 'data-aurora-skin', ...TOGGLES.map((key) => `data-aurora-${key}`)]

    function applyBody(state) {
      const body = document.body
      if (body === null) return
      body.setAttribute('data-aurora-on', '1')
      body.setAttribute('data-aurora-skin', state.skin)
      for (const key of TOGGLES) body.setAttribute(`data-aurora-${key}`, state[key] ? '1' : '0')
    }

    function clearBody() {
      const body = document.body
      if (body === null) return
      for (const name of BODY_ATTRS) body.removeAttribute(name)
    }

    /** Static markup for the backdrop; no user input reaches it. */
    const LAYER_HTML =
      '<div class="dsh-aurora-parallax"><div class="dsh-aurora-drift">' +
      '<div class="dsh-aurora-blob b1"></div>' +
      '<div class="dsh-aurora-blob b2"></div>' +
      '<div class="dsh-aurora-blob b3"></div>' +
      '<div class="dsh-aurora-blob b4"></div>' +
      '</div></div>' +
      '<div class="dsh-aurora-sweep"></div>' +
      '<canvas class="dsh-aurora-motes"></canvas>' +
      '<div class="dsh-aurora-grain"></div>' +
      '<div class="dsh-aurora-vignette"></div>'

    /**
     * Canvas dust: capped DPR, ~one mote per 24k px², paused when hidden.
     * Reduced motion draws a single static frame.
     */
    function createMotes(canvas) {
      const context = canvas.getContext('2d')
      if (context === null) return { sync() {}, dispose() {} }

      let width = 0
      let height = 0
      let dpr = 1
      let frame = 0
      let last = 0
      let motes = []
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

      function spawn(anywhere) {
        return {
          x: Math.random() * width,
          y: anywhere ? Math.random() * height : height + Math.random() * 40,
          r: 0.5 + Math.random() * 1.6,
          a: 0.08 + Math.random() * 0.3,
          speed: 5 + Math.random() * 9,
          sway: 0.3 + Math.random() * 1.1,
          phase: Math.random() * Math.PI * 2,
        }
      }

      function measure() {
        const nextWidth = Math.max(1, window.innerWidth)
        const nextHeight = Math.max(1, window.innerHeight)
        const nextDpr = Math.min(2, window.devicePixelRatio || 1)
        if (nextWidth === width && nextHeight === height && nextDpr === dpr) return
        width = nextWidth
        height = nextHeight
        dpr = nextDpr
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
        const count = Math.max(18, Math.min(90, Math.round((width * height) / 24000)))
        motes = Array.from({ length: count }, () => spawn(true))
      }

      function draw(delta, time) {
        const dark = document.body !== null && document.body.hasAttribute('data-ds-dark-theme')
        context.setTransform(dpr, 0, 0, dpr, 0, 0)
        context.clearRect(0, 0, width, height)
        context.fillStyle = dark ? 'rgba(214, 240, 255, 0.85)' : 'rgba(22, 48, 78, 0.7)'
        for (const mote of motes) {
          if (delta > 0) {
            mote.y -= mote.speed * delta
            mote.x += Math.sin(time * mote.sway + mote.phase) * 5 * delta
            if (mote.y < -12) Object.assign(mote, spawn(false))
            if (mote.x < -12 || mote.x > width + 12) mote.x = Math.random() * width
          }
          context.globalAlpha = mote.a
          context.beginPath()
          context.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2)
          context.fill()
        }
        context.globalAlpha = 1
      }

      function tick(time) {
        const seconds = time / 1000
        const delta = last === 0 ? 0 : Math.min(0.05, seconds - last)
        last = seconds
        draw(delta, seconds)
        frame = requestAnimationFrame(tick)
      }

      function stop() {
        if (frame !== 0) cancelAnimationFrame(frame)
        frame = 0
        last = 0
      }

      return {
        sync(state) {
          const active = state.motes && document.hidden !== true
          if (active && !reduced) {
            measure()
            if (frame === 0) frame = requestAnimationFrame(tick)
          } else {
            stop()
            measure()
            if (reduced) draw(0, 0)
          }
        },
        dispose() {
          stop()
        },
      }
    }

    function install(store) {
      if (typeof document === 'undefined' || document.body === null) return () => {}

      // HMR re-applies the plugin; drop a previous generation before rebuilding.
      document.getElementById(STYLE_ID)?.remove()
      document.getElementById(LAYER_ID)?.remove()

      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)

      const layer = document.createElement('div')
      layer.id = LAYER_ID
      layer.setAttribute('aria-hidden', 'true')
      layer.innerHTML = LAYER_HTML
      document.body.appendChild(layer)

      const canvas = layer.querySelector('canvas')
      const motes = canvas === null ? null : createMotes(canvas)

      const render = () => {
        const state = store.get()
        applyBody(state)
        if (motes !== null) motes.sync(state)
      }
      const unsubscribe = store.subscribe(render)
      render()

      let pointerFrame = 0
      let pointerX = 0
      let pointerY = 0
      const onPointerMove = (event) => {
        if (!store.get().parallax) return
        pointerX = event.clientX / Math.max(1, window.innerWidth) - 0.5
        pointerY = event.clientY / Math.max(1, window.innerHeight) - 0.5
        if (pointerFrame !== 0) return
        pointerFrame = requestAnimationFrame(() => {
          pointerFrame = 0
          layer.style.setProperty('--mx', pointerX.toFixed(3))
          layer.style.setProperty('--my', pointerY.toFixed(3))
        })
      }
      window.addEventListener('pointermove', onPointerMove, { passive: true })

      const onVisibility = () => render()
      document.addEventListener('visibilitychange', onVisibility)

      return () => {
        unsubscribe()
        if (pointerFrame !== 0) cancelAnimationFrame(pointerFrame)
        window.removeEventListener('pointermove', onPointerMove)
        document.removeEventListener('visibilitychange', onVisibility)
        if (motes !== null) motes.dispose()
        layer.remove()
        style.remove()
        clearBody()
      }
    }

    /* ------------------------------------------------------------------ */
    /* page + sidebar entry                                               */
    /* ------------------------------------------------------------------ */

    function SkinIcon(props) {
      const size = props !== null && props !== undefined && Number.isFinite(props.size) ? props.size : 20
      const active = props !== null && props !== undefined && props.active === true
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
          'data-aurora-icon': active ? 'active' : 'idle',
        },
        h('path', {
          d: 'M3 15c3-6 5 3 8-2s4 1 6-1 3 0 4 1',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M3 19c3-5 5 2 8-2s4 1 6-1 3 0 4 1',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
          opacity: 0.6,
        }),
        h('circle', { cx: 17, cy: 6, r: 1.4, fill: 'currentColor' }),
      )
    }

    function ToggleRow(props) {
      const on = props.on === true
      return h(
        'div',
        { className: 'dsh-aurora-row' },
        h(
          'div',
          { className: 'dsh-aurora-row-text' },
          h('span', { className: 'dsh-aurora-row-title' }, translate(props.id)),
          h('span', { className: 'dsh-aurora-row-desc' }, translate(`${props.id}.desc`)),
        ),
        h(
          'button',
          {
            type: 'button',
            role: 'switch',
            'aria-checked': on,
            'aria-label': translate(props.id),
            className: 'dsh-aurora-switch' + (on ? ' is-on' : ''),
            onClick: () => store.set({ [props.id]: !on }),
          },
          h('span', { className: 'dsh-aurora-knob' }),
        ),
      )
    }

    function SkinPage() {
      const state = useSkin()
      return h(
        'section',
        { className: 'dsh-aurora-page', 'data-aurora-page': '' },
        h(
          'header',
          { className: 'dsh-aurora-head' },
          h('h1', { className: 'dsh-aurora-title' }, translate('title')),
          h('p', { className: 'dsh-aurora-intro' }, translate('intro')),
        ),
        h(
          'div',
          { className: 'dsh-aurora-section' },
          h('h2', { className: 'dsh-aurora-section-title' }, translate('palette')),
          h(
            'div',
            { className: 'dsh-aurora-skins', role: 'radiogroup', 'aria-label': translate('palette') },
            ...SKINS.map((skin) => {
              const selected = state.skin === skin.id
              return h(
                'button',
                {
                  key: skin.id,
                  type: 'button',
                  role: 'radio',
                  'aria-checked': selected,
                  className: 'dsh-aurora-skin' + (selected ? ' is-active' : ''),
                  onClick: () => store.set({ skin: skin.id }),
                  style: {
                    '--s1': skin.dark.a1,
                    '--s2': skin.dark.a2,
                    '--s3': skin.dark.a3,
                    '--s4': skin.dark.a4,
                  },
                },
                h('span', { className: 'dsh-aurora-swatch', 'aria-hidden': 'true' }),
                h('span', { className: 'dsh-aurora-skin-name' }, translate(`skin.${skin.id}`)),
                h('span', { className: 'dsh-aurora-skin-desc' }, translate(`skin.${skin.id}.desc`)),
                selected ? h('span', { className: 'dsh-aurora-badge' }, translate('active')) : null,
              )
            }),
          ),
        ),
        h(
          'div',
          { className: 'dsh-aurora-section' },
          h('h2', { className: 'dsh-aurora-section-title' }, translate('effects')),
          ...TOGGLES.map((key) => h(ToggleRow, { key, id: key, on: state[key] })),
        ),
        h(
          'footer',
          { className: 'dsh-aurora-foot' },
          h('button', { type: 'button', className: 'dsh-aurora-reset', onClick: () => store.reset() }, translate('reset')),
          h('p', { className: 'dsh-aurora-note' }, translate('note')),
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* plugin                                                             */
    /* ------------------------------------------------------------------ */

    function apply(ctx) {
      // The backdrop is page-wide, not page-bound: installing here keeps it
      // alive while the user switches main panels.
      ctx.effect(() => install(store), 'aurora-theme: background layer')

      // Optional on purpose: a web composition without the locale service
      // still gets the skin and the browser-language fallback.
      ctx.inject(['locale'], (owner) => {
        owner.effect(() => owner.locale.register(NS, { zh: ZH, en: EN }), 'aurora-theme: dictionaries')
        const bound = owner.locale.bind(NS)
        translate = (key) => {
          try {
            return bound(key)
          } catch {
            return (prefersZh ? ZH : EN)[key] ?? key
          }
        }
      })

      // Two seats: the sidebar row and the main panel it opens. `id` and `key`
      // must match or clicking the row cannot select the page.
      ctx.slots.inject('sidebar.panellist', () => {
        try {
          return ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 20,
              label: () => translate('panel'),
              locale: NS,
            },
            SkinIcon,
          )
        } catch (error) {
          console.warn('aurora-theme: sidebar entry not registered', error)
          return () => {}
        }
      })

      ctx.slots.inject('main', () => {
        try {
          return ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, SkinPage)
        } catch (error) {
          console.warn('aurora-theme: skin page not registered', error)
          return () => {}
        }
      })
    }

/* -------------------------------------------------------------------- */
/* styles                                                               */
/* -------------------------------------------------------------------- */

const CSS = `
/* Palette tokens. Dark is the default; light only differs in values. */
body[data-aurora-on] {
  --a-bg: #05080f; --a1: #48f0c0; --a2: #4f7cff; --a3: #b45cff; --a4: #ff5ea8;
}
body[data-aurora-on][data-aurora-skin="ember"] {
  --a-bg: #0d0709; --a1: #ffb347; --a2: #ff5e7a; --a3: #a855f7; --a4: #ff8a3d;
}
body[data-aurora-on][data-aurora-skin="mint"] {
  --a-bg: #04100d; --a1: #9bffcf; --a2: #2fbf8f; --a3: #3aa7c9; --a4: #7de2ff;
}
body[data-aurora-on]:not([data-ds-dark-theme]) {
  --a-bg: #eef4fb; --a1: #0f9f7a; --a2: #2f5be0; --a3: #8a3ff0; --a4: #e02f7a;
}
body[data-aurora-on]:not([data-ds-dark-theme])[data-aurora-skin="ember"] {
  --a-bg: #fdf1ea; --a1: #c96a00; --a2: #d02f4f; --a3: #7c3aed; --a4: #d97706;
}
body[data-aurora-on]:not([data-ds-dark-theme])[data-aurora-skin="mint"] {
  --a-bg: #eefaf4; --a1: #0f8f63; --a2: #0e7a5f; --a3: #0e7490; --a4: #0891b2;
}

/* The frame, body and center column all paint --dsw-alias-bg-base; making it
   translucent is what lets the backdrop through. !important beats the theme
   presenter's inline variables without fighting it on every theme change. */
body[data-aurora-on] {
  --dsw-alias-bg-base: var(--a-bg) !important;
  --dsw-alias-bg-base: color-mix(in srgb, var(--a-bg) 82%, transparent) !important;
  --dsw-specific-bubble: color-mix(in srgb, var(--a2) 18%, var(--a-bg)) !important;
  --dsw-specific-bubble-highlight: color-mix(in srgb, var(--a2) 26%, var(--a-bg)) !important;
  --dsw-specific-sidebar-fill: color-mix(in srgb, var(--a-bg) 60%, transparent) !important;
}
body[data-aurora-on][data-aurora-glass="1"] {
  --dsw-alias-bg-base: color-mix(in srgb, var(--a-bg) 58%, transparent) !important;
  --dsw-specific-sidebar-fill: color-mix(in srgb, var(--a-bg) 46%, transparent) !important;
  --dsw-alias-bg-layer-1: color-mix(in srgb, var(--a-bg) 82%, transparent) !important;
  --dsw-alias-bg-layer-2: color-mix(in srgb, var(--a-bg) 86%, transparent) !important;
  --dsw-alias-bg-layer-3: color-mix(in srgb, var(--a-bg) 90%, transparent) !important;
  --dsw-alias-border-l1: color-mix(in srgb, var(--a1) 16%, transparent) !important;
  --dsw-alias-border-l2: color-mix(in srgb, var(--a2) 18%, transparent) !important;
  --dsw-alias-border-l3: color-mix(in srgb, var(--a3) 22%, transparent) !important;
}

#dsh-aurora-layer {
  position: fixed; inset: 0; z-index: -1;
  overflow: hidden; pointer-events: none;
  background:
    radial-gradient(900px 620px at 12% 0%, color-mix(in srgb, var(--a1) 30%, transparent), transparent 70%),
    radial-gradient(820px 620px at 88% 6%, color-mix(in srgb, var(--a2) 26%, transparent), transparent 70%),
    radial-gradient(900px 720px at 72% 100%, color-mix(in srgb, var(--a3) 24%, transparent), transparent 72%),
    radial-gradient(760px 520px at 45% 118%, color-mix(in srgb, var(--a4) 18%, transparent), transparent 70%),
    var(--a-bg);
}
#dsh-aurora-layer .dsh-aurora-parallax,
#dsh-aurora-layer .dsh-aurora-drift { position: absolute; inset: -12%; }
#dsh-aurora-layer .dsh-aurora-parallax {
  transform: translate3d(calc(var(--mx, 0) * 14px), calc(var(--my, 0) * 10px), 0);
  transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
}
body[data-aurora-parallax="0"] #dsh-aurora-layer .dsh-aurora-parallax { transform: none; }
#dsh-aurora-layer .dsh-aurora-drift { animation: aurora-drift 34s ease-in-out infinite alternate; }
#dsh-aurora-layer .dsh-aurora-blob {
  position: absolute; width: 56vmax; height: 56vmax; border-radius: 50%;
  filter: blur(90px); mix-blend-mode: screen; opacity: 0.52;
  animation: aurora-breathe 12s ease-in-out infinite alternate;
}
body:not([data-ds-dark-theme]) #dsh-aurora-layer .dsh-aurora-blob {
  mix-blend-mode: multiply; opacity: 0.38; filter: blur(80px);
}
#dsh-aurora-layer .b1 { top: -12%; left: -2%; background: radial-gradient(circle at 50% 50%, var(--a1), transparent 64%); }
#dsh-aurora-layer .b2 { top: -4%; right: -8%; background: radial-gradient(circle at 50% 50%, var(--a2), transparent 63%); animation-delay: -4s; }
#dsh-aurora-layer .b3 { bottom: -24%; left: 22%; background: radial-gradient(circle at 50% 50%, var(--a3), transparent 62%); animation-delay: -8s; }
#dsh-aurora-layer .b4 {
  bottom: -10%; right: -2%; width: 38vmax; height: 38vmax;
  background: radial-gradient(circle at 50% 50%, var(--a4), transparent 62%);
  animation-delay: -2s;
}
body[data-aurora-glow="0"] #dsh-aurora-layer .dsh-aurora-drift { display: none; }
body[data-aurora-breathe="0"] #dsh-aurora-layer .dsh-aurora-blob { animation: none; }

#dsh-aurora-layer .dsh-aurora-sweep {
  position: absolute; top: -30%; left: -40%; width: 34%; height: 160%;
  transform: rotate(18deg);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent);
  animation: aurora-sweep 17s linear infinite;
}
body[data-aurora-sweep="0"] #dsh-aurora-layer .dsh-aurora-sweep { display: none; }

#dsh-aurora-layer .dsh-aurora-motes { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.75; }
body[data-aurora-motes="0"] #dsh-aurora-layer .dsh-aurora-motes { display: none; }

#dsh-aurora-layer .dsh-aurora-grain {
  position: absolute; inset: 0; opacity: 0.05; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E");
}
body[data-aurora-grain="0"] #dsh-aurora-layer .dsh-aurora-grain { display: none; }

#dsh-aurora-layer .dsh-aurora-vignette {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 42%, transparent 46%, rgba(0, 0, 0, 0.30) 100%);
}
body:not([data-ds-dark-theme]) #dsh-aurora-layer .dsh-aurora-vignette {
  background: radial-gradient(ellipse at 50% 42%, transparent 50%, rgba(10, 20, 35, 0.08) 100%);
}

@keyframes aurora-drift {
  from { transform: rotate(0deg) scale(1); }
  to { transform: rotate(7deg) scale(1.07); }
}
@keyframes aurora-breathe {
  from { opacity: 0.34; transform: scale(0.92); }
  to { opacity: 0.58; transform: scale(1.06); }
}
@keyframes aurora-sweep {
  from { translate: -30vw 0; }
  to { translate: 150vw 0; }
}

/* Frost only our own page: blurring a column would create a containing block
   for any fixed-position descendant the shell renders inside it. */
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  body[data-aurora-glass="1"] .dsh-aurora-page {
    -webkit-backdrop-filter: blur(16px) saturate(1.1);
    backdrop-filter: blur(16px) saturate(1.1);
  }
}

@media (prefers-reduced-motion: reduce) {
  #dsh-aurora-layer .dsh-aurora-drift,
  #dsh-aurora-layer .dsh-aurora-blob,
  #dsh-aurora-layer .dsh-aurora-sweep { animation: none !important; }
}
@media (prefers-reduced-transparency: reduce) {
  body[data-aurora-on],
  body[data-aurora-on][data-aurora-glass="1"] {
    --dsw-alias-bg-base: var(--a-bg) !important;
    --dsw-specific-sidebar-fill: var(--a-bg) !important;
  }
  #dsh-aurora-layer { opacity: 0.55; }
}

/* ---- skin page ---- */
.dsh-aurora-page {
  max-width: 880px; margin: 0 auto; padding: 36px 24px 72px;
  color: var(--dsw-alias-label-primary, #111);
  font: inherit;
  /* The main column already dims the backdrop; no second panel, so the page
     does not read as a black card floating over the skin. */
}
.dsh-aurora-head { margin-bottom: 28px; }
.dsh-aurora-title { margin: 0 0 8px; font-size: 24px; line-height: 34px; font-weight: 600; }
.dsh-aurora-intro { margin: 0; max-width: 62ch; color: var(--dsw-alias-label-secondary, #555); font-size: 14px; line-height: 22px; }
.dsh-aurora-section { margin-top: 30px; }
.dsh-aurora-section-title { margin: 0 0 12px; font-size: 13px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary, #777); }
.dsh-aurora-skins { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
.dsh-aurora-skin {
  position: relative; display: flex; flex-direction: column; gap: 8px;
  padding: 12px; border-radius: 14px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.25));
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.08));
  color: inherit; font: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.dsh-aurora-skin:hover { transform: translateY(-1px); }
.dsh-aurora-skin.is-active {
  border-color: var(--a2);
  box-shadow: 0 0 0 1px var(--a2) inset, 0 10px 30px rgba(0, 0, 0, 0.16);
}
.dsh-aurora-skin:focus-visible, .dsh-aurora-switch:focus-visible, .dsh-aurora-reset:focus-visible {
  outline: 2px solid var(--a2); outline-offset: 2px;
}
.dsh-aurora-swatch {
  height: 56px; border-radius: 10px;
  background:
    radial-gradient(circle at 18% 26%, var(--s1), transparent 56%),
    radial-gradient(circle at 78% 18%, var(--s2), transparent 58%),
    radial-gradient(circle at 62% 92%, var(--s3), transparent 56%),
    linear-gradient(150deg, var(--s4), #05070d);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}
.dsh-aurora-skin-name { font-size: 14px; font-weight: 600; }
.dsh-aurora-skin-desc { font-size: 12px; color: var(--dsw-alias-label-tertiary, #777); }
.dsh-aurora-badge {
  position: absolute; top: 10px; right: 10px;
  padding: 2px 8px; border-radius: 999px;
  background: var(--a2); color: #fff; font-size: 11px; line-height: 16px;
}
.dsh-aurora-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 13px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.16));
}
.dsh-aurora-row:last-of-type { border-bottom: none; }
.dsh-aurora-row-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dsh-aurora-row-title { font-size: 14px; }
.dsh-aurora-row-desc { font-size: 12px; color: var(--dsw-alias-label-tertiary, #777); }
.dsh-aurora-switch {
  position: relative; flex: none; width: 40px; height: 22px; padding: 0;
  border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.3));
  background: var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, 0.18));
  transition: background 0.18s ease, border-color 0.18s ease;
}
.dsh-aurora-switch.is-on { background: var(--a2); border-color: transparent; }
.dsh-aurora-knob {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.18s ease;
}
.dsh-aurora-switch.is-on .dsh-aurora-knob { transform: translateX(18px); }
.dsh-aurora-foot { display: flex; align-items: center; gap: 16px; margin-top: 30px; flex-wrap: wrap; }
.dsh-aurora-reset {
  padding: 8px 14px; border-radius: 10px; cursor: pointer; font: inherit;
  border: 1px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.3));
  background: transparent; color: inherit;
}
.dsh-aurora-reset:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.1)); }
.dsh-aurora-note { margin: 0; font-size: 12px; color: var(--dsw-alias-label-tertiary, #777); }
`

    return { name: NAME, inject: ['slots'], apply }
  },
})
