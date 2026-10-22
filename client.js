/**
 * Browser half of `dsh-aurora-theme`.
 *
 * Contract: a classic script (no import/export) that calls
 * `window.__ModuleLoader__.load` once. `factory` runs lazily and returns an
 * ordinary Cordis plugin; the shell starts it once the `slots` service exists.
 *
 * Layout of this file:
 *   1. constants, palettes, dictionaries
 *   2. persisted state + IndexedDB wallpaper store
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
    const VERSION = '0.2.1'
    /** Main-panel key and sidebar entry id; they must match. */
    const PANEL_ID = 'aurora-theme'
    /** Locale namespace for this plugin's dictionaries. */
    const NS = 'auroraTheme'
    const STORAGE_KEY = 'dsh-aurora-theme/v2'
    const LEGACY_KEYS = ['dsh-aurora-theme/v1', 'dsh-aurora-theme', 'aurora-theme']
    const LAYER_ID = 'dsh-aurora-layer'
    const STYLE_ID = 'dsh-aurora-style'
    const DB_NAME = 'dsh-aurora-theme'
    const DB_STORE = 'assets'
    const WALLPAPER_KEY = 'wallpaper'

    const MODES = ['aurora', 'ember', 'mint', 'wallpaper', 'off']
    /** Toggle order on the page; each key becomes `data-aurora-<key>`. */
    const TOGGLES = ['glow', 'parallax', 'breathe', 'sweep', 'motes', 'grain', 'glass']
    const DEFAULT_STATE = {
      mode: 'aurora',
      blur: 8,
      dim: 30,
      glow: true,
      parallax: true,
      breathe: true,
      sweep: true,
      motes: true,
      grain: true,
      glass: true,
    }

    const PALETTES = [
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

    const ZH = {
      panel: '皮肤',
      title: '皮肤',
      intro: '换一张背景，或挑一套极光配色；再把面板调成玻璃。改动即时生效，不用重启，也不影响正在跑的会话。',
      palette: '外观',
      wallpaper: '我的壁纸',
      'wallpaper.empty': '还没选图，点一下选一张',
      'wallpaper.picked': '已选图，点一下更换',
      'wallpaper.ready': '已选图，点一下使用',
      choose: '选图',
      off: '关闭',
      'off.desc': '回到官方原版外观',
      'skin.aurora': '深海极光',
      'skin.aurora.desc': '青绿 · 靛蓝 · 品红，冷色玻璃',
      'skin.ember': '落日余烬',
      'skin.ember.desc': '琥珀 · 玫红 · 紫，暖色玻璃',
      'skin.mint': '苍苔',
      'skin.mint.desc': '薄荷 · 松绿 · 湖蓝，清透玻璃',
      wallpaperSection: '壁纸',
      background: '背景图',
      remove: '移除',
      blur: '模糊',
      dim: '压暗',
      effects: '动效',
      glow: '光标光晕',
      parallax: '壁纸视差',
      breathe: '呼吸光',
      sweep: '光斑扫过',
      motes: '漂浮光点',
      grain: '颗粒噪点',
      glass: '分区玻璃',
      active: '当前',
      note: '图片只存在本机（IndexedDB），不会上传。选「关闭」就回到原版外观。',
    }

    const EN = {
      panel: 'Skin',
      title: 'Skin',
      intro: 'Pick a wallpaper or an aurora palette, then turn the panels into glass. Changes apply immediately — no restart, no effect on running sessions.',
      palette: 'Appearance',
      wallpaper: 'My wallpaper',
      'wallpaper.empty': 'No image yet — click to choose one',
      'wallpaper.picked': 'Image selected — click to replace',
      'wallpaper.ready': 'Saved — click to use',
      choose: 'Choose',
      off: 'Off',
      'off.desc': 'Back to the stock look',
      'skin.aurora': 'Deep aurora',
      'skin.aurora.desc': 'Teal · indigo · magenta, cool glass',
      'skin.ember': 'Sunset ember',
      'skin.ember.desc': 'Amber · rose · violet, warm glass',
      'skin.mint': 'Moss',
      'skin.mint.desc': 'Mint · pine · lagoon, clear glass',
      wallpaperSection: 'Wallpaper',
      background: 'Background',
      remove: 'Remove',
      blur: 'Blur',
      dim: 'Dim',
      effects: 'Effects',
      glow: 'Cursor glow',
      parallax: 'Wallpaper parallax',
      breathe: 'Breathing light',
      sweep: 'Light sweep',
      motes: 'Floating motes',
      grain: 'Film grain',
      glass: 'Panel glass',
      active: 'Active',
      note: 'The image stays in this browser (IndexedDB) and is never uploaded. Pick “Off” to return to the stock look.',
    }

    // The locale service may arrive after the page is registered; until it
    // binds, fall back to the browser's language rather than showing keys.
    const prefersZh = typeof navigator === 'undefined' || !navigator.language || navigator.language.toLowerCase().startsWith('zh')
    let translate = (key) => (prefersZh ? ZH : EN)[key] ?? key

    /* ------------------------------------------------------------------ */
    /* persisted state                                                    */
    /* ------------------------------------------------------------------ */

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value))
    }

    function normalize(raw) {
      const state = { ...DEFAULT_STATE }
      if (raw === null || typeof raw !== 'object') return state
      if (MODES.includes(raw.mode)) state.mode = raw.mode
      else if (typeof raw.skin === 'string' && MODES.includes(raw.skin)) state.mode = raw.skin
      if (Number.isFinite(raw.blur)) state.blur = clamp(Math.round(raw.blur), 0, 40)
      if (Number.isFinite(raw.dim)) state.dim = clamp(Math.round(raw.dim), 0, 80)
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
    /* wallpaper: IndexedDB blob + object URL                             */
    /* ------------------------------------------------------------------ */

    let wallpaperUrl = null
    const wallpaperListeners = new Set()

    function getWallpaper() {
      return wallpaperUrl
    }

    function setWallpaper(url) {
      if (wallpaperUrl !== null && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(wallpaperUrl)
      }
      wallpaperUrl = url
      for (const listener of [...wallpaperListeners]) {
        try {
          listener()
        } catch (error) {
          console.warn('aurora-theme: wallpaper listener failed', error)
        }
      }
    }

    function subscribeWallpaper(listener) {
      wallpaperListeners.add(listener)
      return () => wallpaperListeners.delete(listener)
    }

    function useWallpaper() {
      return React.useSyncExternalStore(subscribeWallpaper, getWallpaper)
    }

    function openDb() {
      return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB is unavailable'))
          return
        }
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
      })
    }

    async function idbGet(key) {
      const db = await openDb()
      try {
        return await new Promise((resolve, reject) => {
          const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'))
        })
      } finally {
        db.close()
      }
    }

    async function idbPut(key, value) {
      const db = await openDb()
      try {
        await new Promise((resolve, reject) => {
          const request = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(value, key)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error ?? new Error('IndexedDB write failed'))
        })
      } finally {
        db.close()
      }
    }

    async function idbDelete(key) {
      const db = await openDb()
      try {
        await new Promise((resolve, reject) => {
          const request = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(key)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error ?? new Error('IndexedDB delete failed'))
        })
      } finally {
        db.close()
      }
    }

    async function hydrateWallpaper() {
      try {
        const blob = await idbGet(WALLPAPER_KEY)
        if (!(typeof Blob !== 'undefined' && blob instanceof Blob)) return
        if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
        setWallpaper(URL.createObjectURL(blob))
      } catch {
        // No persisted image, or storage unavailable: the palette still works.
      }
    }

    async function saveWallpaper(blob) {
      try {
        await idbPut(WALLPAPER_KEY, blob)
      } catch (error) {
        // The image still works for this session; only persistence is lost.
        console.warn('aurora-theme: wallpaper not persisted', error)
      }
      setWallpaper(URL.createObjectURL(blob))
      store.set({ mode: 'wallpaper' })
    }

    async function removeWallpaper() {
      try {
        await idbDelete(WALLPAPER_KEY)
      } catch {
        // Removing the runtime copy still works when storage is unavailable.
      }
      setWallpaper(null)
      if (store.get().mode === 'wallpaper') store.set({ mode: 'aurora' })
    }

    /* ------------------------------------------------------------------ */
    /* background layer                                                   */
    /* ------------------------------------------------------------------ */

    const BODY_ATTRS = ['data-aurora-on', 'data-aurora-mode', ...TOGGLES.map((key) => `data-aurora-${key}`)]

    function applyBody(state) {
      const body = document.body
      if (body === null) return
      if (state.mode === 'off') body.removeAttribute('data-aurora-on')
      else body.setAttribute('data-aurora-on', '1')
      body.setAttribute('data-aurora-mode', state.mode)
      for (const key of TOGGLES) body.setAttribute(`data-aurora-${key}`, state[key] ? '1' : '0')
    }

    function clearBody() {
      const body = document.body
      if (body === null) return
      for (const name of BODY_ATTRS) body.removeAttribute(name)
    }

    function applyLayer(state) {
      const layer = document.getElementById(LAYER_ID)
      if (layer === null) return
      layer.style.setProperty('--a-blur', String(state.blur))
      layer.style.setProperty('--a-dim', String(state.dim))
    }

    /** Static markup for the backdrop; no user input reaches it. */
    const LAYER_HTML =
      '<div class="dsh-aurora-parallax">' +
      '<div class="dsh-aurora-wallpaper"><img alt=""></div>' +
      '<div class="dsh-aurora-drift">' +
      '<div class="dsh-aurora-blob b1"></div>' +
      '<div class="dsh-aurora-blob b2"></div>' +
      '<div class="dsh-aurora-blob b3"></div>' +
      '<div class="dsh-aurora-blob b4"></div>' +
      '</div></div>' +
      '<div class="dsh-aurora-cursor"></div>' +
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
          const active = state.motes && state.mode !== 'off' && document.hidden !== true
          if (active && !reduced) {
            measure()
            if (frame === 0) frame = requestAnimationFrame(tick)
          } else {
            stop()
            measure()
            if (reduced && state.mode !== 'off') draw(0, 0)
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

      const image = layer.querySelector('img')
      const canvas = layer.querySelector('canvas')
      const motes = canvas === null ? null : createMotes(canvas)

      const syncWallpaper = () => {
        if (image === null) return
        if (wallpaperUrl === null) image.removeAttribute('src')
        else image.setAttribute('src', wallpaperUrl)
      }
      const unsubscribeWallpaper = subscribeWallpaper(syncWallpaper)
      syncWallpaper()

      const render = () => {
        const state = store.get()
        applyBody(state)
        applyLayer(state)
        if (motes !== null) motes.sync(state)
      }
      const unsubscribe = store.subscribe(render)
      render()

      void hydrateWallpaper()

      let pointerFrame = 0
      let pointerX = 0
      let pointerY = 0
      let cursorX = 0
      let cursorY = 0
      const onPointerMove = (event) => {
        cursorX = event.clientX
        cursorY = event.clientY
        if (!store.get().parallax && !store.get().glow) return
        pointerX = event.clientX / Math.max(1, window.innerWidth) - 0.5
        pointerY = event.clientY / Math.max(1, window.innerHeight) - 0.5
        if (pointerFrame !== 0) return
        pointerFrame = requestAnimationFrame(() => {
          pointerFrame = 0
          layer.style.setProperty('--cx', `${cursorX}px`)
          layer.style.setProperty('--cy', `${cursorY}px`)
          layer.style.setProperty('--mx', pointerX.toFixed(3))
          layer.style.setProperty('--my', pointerY.toFixed(3))
        })
      }
      window.addEventListener('pointermove', onPointerMove, { passive: true })

      const onVisibility = () => render()
      document.addEventListener('visibilitychange', onVisibility)

      return () => {
        unsubscribe()
        unsubscribeWallpaper()
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

    function ChoiceCard(props) {
      const selected = props.selected === true
      return h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': selected,
          className: 'dsh-aurora-card' + (selected ? ' is-active' : ''),
          onClick: props.onClick,
        },
        props.preview,
        h('span', { className: 'dsh-aurora-card-name' }, props.name),
        h('span', { className: 'dsh-aurora-card-desc' }, props.desc),
        selected ? h('span', { className: 'dsh-aurora-badge' }, translate('active')) : null,
      )
    }

    function Swatch(props) {
      const palette = props.palette
      return h('span', {
        className: 'dsh-aurora-preview dsh-aurora-swatch',
        'aria-hidden': 'true',
        style: { '--s1': palette.dark.a1, '--s2': palette.dark.a2, '--s3': palette.dark.a3, '--s4': palette.dark.a4 },
      })
    }

    function Toggle(props) {
      const on = props.on === true
      return h(
        'div',
        { className: 'dsh-aurora-row' },
        h('span', { className: 'dsh-aurora-row-label' }, translate(props.id)),
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

    function Slider(props) {
      return h(
        'div',
        { className: 'dsh-aurora-row' },
        h('span', { className: 'dsh-aurora-row-label' }, translate(props.id)),
        h(
          'span',
          { className: 'dsh-aurora-row-control' },
          h('input', {
            className: 'dsh-aurora-range',
            type: 'range',
            min: props.min,
            max: props.max,
            step: 1,
            value: props.value,
            'aria-label': translate(props.id),
            onChange: (event) => store.set({ [props.id]: Number(event.target.value) }),
          }),
          h('span', { className: 'dsh-aurora-value' }, `${props.value}${props.unit}`),
        ),
      )
    }

    function SkinPage() {
      const state = useSkin()
      const url = useWallpaper()
      const fileRef = React.useRef(null)

      const pick = () => {
        if (fileRef.current !== null) fileRef.current.click()
      }
      const onFile = async (event) => {
        const file = event.target.files === null ? undefined : event.target.files[0]
        if (file === undefined) return
        if (!/^image\//.test(file.type)) {
          event.target.value = ''
          return
        }
        try {
          await saveWallpaper(file)
        } catch (error) {
          console.warn('aurora-theme: wallpaper not saved', error)
        }
        event.target.value = ''
      }

      return h(
        'section',
        { className: 'dsh-aurora-page', 'data-aurora-page': '' },
        h('input', {
          type: 'file',
          accept: 'image/*',
          ref: fileRef,
          style: { display: 'none' },
          onChange: onFile,
        }),
        h(
          'header',
          { className: 'dsh-aurora-head' },
          h('h1', { className: 'dsh-aurora-title' }, translate('title')),
          h('span', { className: 'dsh-aurora-version' }, `v${VERSION}`),
        ),
        h('p', { className: 'dsh-aurora-intro' }, translate('intro')),
        h(
          'div',
          { className: 'dsh-aurora-grid', role: 'radiogroup', 'aria-label': translate('palette') },
          h(ChoiceCard, {
            key: 'wallpaper',
            selected: state.mode === 'wallpaper',
            onClick: () => {
              if (url !== null && state.mode !== 'wallpaper') store.set({ mode: 'wallpaper' })
              else pick()
            },
            preview:
              url === null
                ? h('span', { className: 'dsh-aurora-preview is-empty' }, `+ ${translate('choose')}`)
                : h('span', { className: 'dsh-aurora-preview' }, h('img', { src: url, alt: '' })),
            name: translate('wallpaper'),
            desc: translate(url === null ? 'wallpaper.empty' : state.mode === 'wallpaper' ? 'wallpaper.picked' : 'wallpaper.ready'),
          }),
          ...PALETTES.map((palette) =>
            h(ChoiceCard, {
              key: palette.id,
              selected: state.mode === palette.id,
              onClick: () => store.set({ mode: palette.id }),
              preview: h(Swatch, { palette }),
              name: translate(`skin.${palette.id}`),
              desc: translate(`skin.${palette.id}.desc`),
            }),
          ),
          h(ChoiceCard, {
            key: 'off',
            selected: state.mode === 'off',
            onClick: () => store.set({ mode: 'off' }),
            preview: h('span', { className: 'dsh-aurora-preview is-off' }),
            name: translate('off'),
            desc: translate('off.desc'),
          }),
        ),
        h('h2', { className: 'dsh-aurora-section-title' }, translate('wallpaperSection')),
        h(
          'div',
          { className: 'dsh-aurora-section' },
          h(
            'div',
            { className: 'dsh-aurora-row' },
            h('span', { className: 'dsh-aurora-row-label' }, translate('background')),
            h(
              'span',
              { className: 'dsh-aurora-row-control' },
              url === null
                ? h('span', { className: 'dsh-aurora-thumb is-empty' })
                : h('img', { className: 'dsh-aurora-thumb', src: url, alt: '' }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-aurora-remove',
                  disabled: url === null,
                  onClick: () => void removeWallpaper(),
                },
                translate('remove'),
              ),
            ),
          ),
          h(Slider, { id: 'blur', min: 0, max: 40, value: state.blur, unit: ' px' }),
          h(Slider, { id: 'dim', min: 0, max: 80, value: state.dim, unit: '%' }),
        ),
        h('h2', { className: 'dsh-aurora-section-title' }, translate('effects')),
        h(
          'div',
          { className: 'dsh-aurora-section' },
          ...TOGGLES.map((key) => h(Toggle, { key, id: key, on: state[key] })),
        ),
        h('p', { className: 'dsh-aurora-note' }, translate('note')),
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

    const CSS = `
/* Palette tokens. Dark is the default; light only differs in values. */
body[data-aurora-on] {
  --a-bg: #05080f; --a1: #48f0c0; --a2: #4f7cff; --a3: #b45cff; --a4: #ff5ea8;
}
body[data-aurora-on][data-aurora-mode="ember"] {
  --a-bg: #0d0709; --a1: #ffb347; --a2: #ff5e7a; --a3: #a855f7; --a4: #ff8a3d;
}
body[data-aurora-on][data-aurora-mode="mint"] {
  --a-bg: #04100d; --a1: #9bffcf; --a2: #2fbf8f; --a3: #3aa7c9; --a4: #7de2ff;
}
body[data-aurora-on]:not([data-ds-dark-theme]) {
  --a-bg: #eef4fb; --a1: #0f9f7a; --a2: #2f5be0; --a3: #8a3ff0; --a4: #e02f7a;
}
body[data-aurora-on]:not([data-ds-dark-theme])[data-aurora-mode="ember"] {
  --a-bg: #fdf1ea; --a1: #c96a00; --a2: #d02f4f; --a3: #7c3aed; --a4: #d97706;
}
body[data-aurora-on]:not([data-ds-dark-theme])[data-aurora-mode="mint"] {
  --a-bg: #eefaf4; --a1: #0f8f63; --a2: #0e7a5f; --a3: #0e7490; --a4: #0891b2;
}

/* The frame, body and center column all paint --dsw-alias-bg-base; making it
   translucent is what lets the backdrop through. !important beats the theme
   presenter's inline variables without fighting it on every theme change. */
body[data-aurora-on] {
  --dsw-alias-bg-base: var(--a-bg) !important;
  --dsw-alias-bg-base: color-mix(in srgb, var(--a-bg) 82%, transparent) !important;
  --dsw-specific-sidebar-fill: color-mix(in srgb, var(--a-bg) 60%, transparent) !important;
  --dsw-specific-bubble: color-mix(in srgb, var(--a2) 18%, var(--a-bg)) !important;
  --dsw-specific-bubble-highlight: color-mix(in srgb, var(--a2) 26%, var(--a-bg)) !important;
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
body[data-aurora-mode="off"] #dsh-aurora-layer { display: none; }

#dsh-aurora-layer .dsh-aurora-parallax,
#dsh-aurora-layer .dsh-aurora-drift,
#dsh-aurora-layer .dsh-aurora-wallpaper { position: absolute; inset: -12%; }
#dsh-aurora-layer .dsh-aurora-parallax {
  transform: translate3d(calc(var(--mx, 0) * 14px), calc(var(--my, 0) * 10px), 0);
  transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
}
body[data-aurora-parallax="0"] #dsh-aurora-layer .dsh-aurora-parallax { transform: none; }

#dsh-aurora-layer .dsh-aurora-wallpaper { display: none; }
body[data-aurora-mode="wallpaper"] #dsh-aurora-layer .dsh-aurora-wallpaper { display: block; }
#dsh-aurora-layer .dsh-aurora-wallpaper img {
  width: 100%; height: 100%; object-fit: cover;
  filter: blur(calc(var(--a-blur, 8) * 1px)) brightness(calc(1 - var(--a-dim, 30) / 100));
  transform: scale(1.05);
}
body[data-aurora-mode="wallpaper"] #dsh-aurora-layer .dsh-aurora-drift { display: none; }

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
body[data-aurora-breathe="0"] #dsh-aurora-layer .dsh-aurora-blob { animation: none; }

#dsh-aurora-layer .dsh-aurora-cursor {
  position: absolute; left: 0; top: 0; width: 520px; height: 520px; margin: -260px 0 0 -260px;
  transform: translate3d(var(--cx, 50vw), var(--cy, 50vh), 0);
  background: radial-gradient(circle, color-mix(in srgb, var(--a2) 34%, transparent), transparent 68%);
  filter: blur(24px); mix-blend-mode: screen; opacity: 0;
  transition: opacity 0.25s ease;
}
body[data-aurora-glow="1"] #dsh-aurora-layer .dsh-aurora-cursor { opacity: 0.8; }

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
  body[data-aurora-glass="1"] .dsh-aurora-page .dsh-aurora-section,
  body[data-aurora-glass="1"] .dsh-aurora-page .dsh-aurora-card {
    -webkit-backdrop-filter: blur(14px) saturate(1.08);
    backdrop-filter: blur(14px) saturate(1.08);
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
  /* The main panel gives its page the full column and expects the page to
     scroll itself (same contract as the shipped plugins page). */
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 30px clamp(24px, 4vw, 48px) 64px;
  color: var(--dsw-alias-label-primary, #111);
  font: inherit;
}
[data-platform="darwin"] .dsh-aurora-page {
  padding-top: calc(30px + var(--dsh-frame-top-clearance, 0px));
}
.dsh-aurora-page * { box-sizing: border-box; }
.dsh-aurora-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.dsh-aurora-title { margin: 0; font-size: 22px; line-height: 30px; font-weight: 600; }
.dsh-aurora-version {
  padding: 2px 8px; border-radius: 999px; font-size: 11px; line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #777);
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.25));
}
.dsh-aurora-intro {
  margin: 0 0 22px; max-width: 860px;
  color: var(--dsw-alias-label-secondary, #555); font-size: 13px; line-height: 21px;
}
.dsh-aurora-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px;
}
.dsh-aurora-card {
  position: relative; display: flex; flex-direction: column; gap: 9px;
  padding: 12px; border-radius: 12px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.25));
  background: var(--dsw-alias-bg-layer-1, rgba(127, 127, 127, 0.08));
  color: inherit; font: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.dsh-aurora-card:hover { transform: translateY(-1px); }
.dsh-aurora-card.is-active {
  border-color: var(--a2, #4f7cff);
  box-shadow: 0 0 0 1.5px var(--a2, #4f7cff), 0 10px 26px rgba(0, 0, 0, 0.14);
}
.dsh-aurora-card:focus-visible, .dsh-aurora-switch:focus-visible,
.dsh-aurora-remove:focus-visible, .dsh-aurora-range:focus-visible {
  outline: 2px solid var(--a2, #4f7cff); outline-offset: 2px;
}
.dsh-aurora-preview {
  display: block; height: 96px; border-radius: 8px; overflow: hidden;
  background: linear-gradient(150deg, #1a2233, #0b1018);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}
.dsh-aurora-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dsh-aurora-preview.is-empty {
  display: flex; align-items: center; justify-content: center;
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.12));
  border: 1px dashed var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.35));
  color: var(--dsw-alias-label-tertiary, #777); font-size: 12px;
}
.dsh-aurora-preview.is-off {
  background: linear-gradient(150deg, #2b2f36, #14171c);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.dsh-aurora-swatch {
  background:
    radial-gradient(circle at 18% 26%, var(--s1), transparent 56%),
    radial-gradient(circle at 78% 18%, var(--s2), transparent 58%),
    radial-gradient(circle at 62% 92%, var(--s3), transparent 56%),
    linear-gradient(150deg, var(--s4), #05070d);
}
.dsh-aurora-card-name { font-size: 13px; font-weight: 600; line-height: 18px; }
.dsh-aurora-card-desc { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary, #777); }
.dsh-aurora-badge {
  position: absolute; top: 8px; right: 8px;
  padding: 1px 7px; border-radius: 999px;
  background: var(--a2, #4f7cff); color: #fff; font-size: 10px; line-height: 15px;
}
.dsh-aurora-section-title {
  margin: 24px 0 8px; font-size: 12px; font-weight: 500;
  color: var(--dsw-alias-label-tertiary, #777);
}
.dsh-aurora-section {
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.25));
  border-radius: 12px; padding: 0 16px;
  background: var(--dsw-alias-bg-layer-1, rgba(127, 127, 127, 0.08));
}
.dsh-aurora-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  min-height: 48px; padding: 8px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.16));
}
.dsh-aurora-row:last-child { border-bottom: none; }
.dsh-aurora-row-label { font-size: 13px; }
.dsh-aurora-row-control { display: flex; align-items: center; gap: 10px; }
.dsh-aurora-value {
  min-width: 46px; text-align: right; font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #777); font-variant-numeric: tabular-nums;
}
.dsh-aurora-range { width: 200px; accent-color: var(--a2, #4f7cff); cursor: pointer; }
.dsh-aurora-thumb {
  width: 52px; height: 30px; border-radius: 6px; object-fit: cover; display: block;
  background: var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, 0.2));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}
.dsh-aurora-thumb.is-empty { opacity: 0.5; }
.dsh-aurora-remove {
  padding: 4px 10px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px;
  border: 1px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.3));
  background: transparent; color: inherit;
}
.dsh-aurora-remove:disabled { opacity: 0.45; cursor: default; }
.dsh-aurora-remove:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.1)); }
.dsh-aurora-switch {
  position: relative; flex: none; width: 40px; height: 22px; padding: 0;
  border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.3));
  background: var(--dsw-alias-bg-layer-3, rgba(127, 127, 127, 0.18));
  transition: background 0.18s ease, border-color 0.18s ease;
}
.dsh-aurora-switch.is-on { background: var(--a2, #4f7cff); border-color: transparent; }
.dsh-aurora-knob {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.18s ease;
}
.dsh-aurora-switch.is-on .dsh-aurora-knob { transform: translateX(18px); }
.dsh-aurora-note {
  margin: 18px 0 0; font-size: 11px; line-height: 17px;
  color: var(--dsw-alias-label-tertiary, #777);
}
`

    return { name: NAME, inject: ['slots'], apply }
  },
})
