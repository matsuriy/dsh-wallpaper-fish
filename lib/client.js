// dsh-wallpaper-fish — browser half (fish edition v1.5.0)
// Config UI lives in the DSH Settings window (slots API), with a floating
// panel as automatic fallback when the slots service is unavailable.

window.__ModuleLoader__.load({
  id: "dsh-wallpaper-fish",
  factory: (require) => {
    // ── module seeds (all optional, degrade gracefully) ──
    let jsx = null, jsxs = null, ReactMod = null
    try { const m = require("react/jsx-runtime"); jsx = m.jsx; jsxs = m.jsxs } catch (err) {}
    try { ReactMod = require("react") } catch (err) {}

    const DEBUG_ROUTE = '/wallpaper-skin-debug'
    const report = (text) => {
      try { fetch(DEBUG_ROUTE + '?e=' + encodeURIComponent(text)).catch(() => {}) } catch (err) {}
    }

    // ── persisted prefs ──
    const prefNum = (key, dflt) => {
      const v = parseInt(localStorage.getItem('wps-' + key), 10)
      return Number.isFinite(v) ? v : dflt
    }
    const prefStr = (key, dflt) => localStorage.getItem(key) || dflt
    const fitMode = () => {
      const v = localStorage.getItem('wps-fit')
      return v === 'contain' || v === 'fill' ? v : 'cover'
    }
    const tint = () => localStorage.getItem('wps-tint') === 'light' ? '255,255,255' : '0,0,0'

    const PANEL_TOKENS = [
      'body{--dsw-alias-bg-base:rgba(0,0,0,0.12)!important;--dsw-alias-bg-layer-1:rgba(0,0,0,0.1)!important;--dsw-alias-bg-layer-2:rgba(0,0,0,0.1)!important;--dsw-specific-sidebar-fill:rgba(0,0,0,0.12)!important}',
    ].join('')

    const buildFx = () => {
      const maskA = prefNum('mask', 15) / 100
      return '.mP3x-q_centerCol,.an3WzG_root{background-color:rgba(' + tint() + ',' + maskA + ')!important}' +
        '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'
    }

    return {
      name: 'dsh-wallpaper-fish',
      apply(ctx) {
        try {
          applyInner(ctx)
        } catch (err) {
          report('apply-crashed ' + String(err && err.message ? err.message : err))
        }
      },
    }

    function applyInner(ctx) {
        // singleton guard: if a previous instance is alive (page re-eval /
        // settings remount), tear it down completely before starting over.
        try {
          if (typeof window.__wpsCleanup === 'function') window.__wpsCleanup()
        } catch (err) {}
        report('apply-start fish1.5')

        // ── media state (declared before applyFx uses it) ──
        let video = null
        let backEl = null
        let currentPath = null

        // ── base style + fx style ──
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-wallpaper-fish'
        style.textContent = '.pI_x6G_frame{background:transparent!important}'
        document.head.append(style)
        const panelStyle = document.createElement('style')
        panelStyle.dataset.plugin = 'dsh-wallpaper-fish-panel'
        document.head.append(panelStyle)
        const fxStyle = document.createElement('style')
        fxStyle.dataset.plugin = 'dsh-wallpaper-fish-fx'
        document.head.append(fxStyle)
        // ── tint film: our own full-screen wash between wallpaper and UI ──
        const tintFilm = document.createElement('div')
        tintFilm.setAttribute('style', 'position:fixed;inset:0;z-index:-1;pointer-events:none;background:transparent')
        document.body.appendChild(tintFilm)

        // panel tint follows the wash: light mode brightens the whole UI
        const panelTokens = () => {
          const light = tint() === '255,255,255'
          if (light) {
            return [
              'body{--dsw-alias-bg-base:rgba(255,255,255,0.34)!important;--dsw-alias-bg-layer-1:rgba(255,255,255,0.26)!important;--dsw-alias-bg-layer-2:rgba(255,255,255,0.28)!important;--dsw-specific-sidebar-fill:rgba(250,250,252,0.32)!important}',
              'body[data-ds-dark-theme]{--dsw-alias-bg-base:rgba(250,250,252,0.34)!important;--dsw-alias-bg-layer-1:rgba(255,255,255,0.26)!important;--dsw-alias-bg-layer-2:rgba(255,255,255,0.28)!important;--dsw-specific-sidebar-fill:rgba(250,250,252,0.32)!important}',
            ].join('')
          }
          return [
            'body{--dsw-alias-bg-base:rgba(0,0,0,0.14)!important;--dsw-alias-bg-layer-1:rgba(0,0,0,0.1)!important;--dsw-alias-bg-layer-2:rgba(0,0,0,0.1)!important;--dsw-specific-sidebar-fill:rgba(0,0,0,0.14)!important}',
            'body[data-ds-dark-theme]{--dsw-alias-bg-base:rgba(0,0,0,0.14)!important;--dsw-alias-bg-layer-1:rgba(0,0,0,0.1)!important;--dsw-alias-bg-layer-2:rgba(0,0,0,0.1)!important;--dsw-specific-sidebar-fill:rgba(0,0,0,0.14)!important}',
          ].join('')
        }

        let fxTick = 0
        const applyFx = () => {
          try {
            const maskA = prefNum('mask', 15) / 100
            const color = 'rgba(' + tint() + ',' + maskA + ')'
            tintFilm.style.background = color
            document.body.appendChild(tintFilm)
            fxStyle.textContent = '.mP3x-q_centerCol,.an3WzG_root{background-color:' + color + '!important}' +
              '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'
            document.head.appendChild(fxStyle)
            panelStyle.textContent = panelTokens()
            document.head.appendChild(panelStyle)
            fxTick++
            if (fxTick % 6 === 1) report('FX color=' + tint() + '/' + maskA)
          } catch (err) {}
        }
        applyFx()
        const fxTimer = setInterval(applyFx, 2500)

        // ── media mounting ──

        const teardownMedia = () => {
          for (const el of [video, backEl]) {
            if (el !== null) {
              try {
                if (el.tagName === 'VIDEO') { el.pause(); el.removeAttribute('src'); el.load() }
                el.remove()
              } catch (err) {}
            }
          }
          video = null
          backEl = null
        }

        const FIT_CSS = { cover: 'object-fit:cover', contain: 'object-fit:contain', fill: 'object-fit:fill' }
        const mediaFilter = (extra) => {
          const parts = []
          if (extra) parts.push(extra)
          parts.push('brightness(' + (prefNum('bright', 100) / 100) + ')')
          return 'filter:' + parts.join(' ')
        }
        const mediaStyle = (fit, extraFilter) =>
          'position:fixed;inset:0;width:100%;height:100%;' + FIT_CSS[fit] + ';z-index:-1;pointer-events:none;' + mediaFilter(extraFilter)

        const mountVideo = (url) => {
          teardownMedia()
          video = document.createElement('video')
          video.muted = true
          video.autoplay = true
          video.loop = true
          video.playsInline = true
          video.src = url || '/wps-bytes'
          video.setAttribute('style', mediaStyle(fitMode()))
          document.body.appendChild(video)
          document.body.appendChild(tintFilm)
          const play = video.play()
          if (play !== undefined && typeof play.catch === 'function') play.catch(() => {})
          report('video-mounted fit=' + fitMode())
        }

        const mountImage = (url) => {
          teardownMedia()
          const fit = fitMode()
          if (fit === 'contain') {
            backEl = document.createElement('img')
            backEl.src = url
            backEl.setAttribute('style', mediaStyle('cover', 'blur(28px) saturate(1.2)') + ';transform:scale(1.1)')
            document.body.appendChild(backEl)
          }
          video = document.createElement('img')
          video.src = url
          video.setAttribute('style', mediaStyle(fit))
          document.body.appendChild(video)
          document.body.appendChild(tintFilm)
          report('image-mounted fit=' + fit)
        }

        // live-update brightness without remounting (no flicker)
        const applyBrightness = () => {
          try {
            const b = 'brightness(' + (prefNum('bright', 100) / 100) + ')'
            if (video) video.style.filter = b
            if (backEl) backEl.style.filter = 'blur(28px) saturate(1.2) ' + b
          } catch (err) {}
        }

        // collect page layers that may fog the wallpaper
        const runDiag = () => {
          try {
            const vw = window.innerWidth
            const vh = window.innerHeight
            const rows = []
            for (const el of document.querySelectorAll('body *')) {
              const r = el.getBoundingClientRect()
              if (r.width < vw * 0.15 || r.height < vh * 0.15) continue
              if (r.width * r.height < vw * vh * 0.04) continue
              const cs = window.getComputedStyle(el)
              const bg = String(cs.backgroundColor)
              let alpha = bg.startsWith('rgba') ? (parseFloat(bg.split(',')[3]) || 0) : (bg === 'transparent' ? 0 : 1)
              if (alpha > 0.02 || cs.backgroundImage !== 'none' || (cs.backdropFilter && cs.backdropFilter !== 'none')) {
                rows.push({ s: el.tagName + '.' + String(el.className).slice(0, 40), a: Math.round(alpha * 100) / 100, bi: cs.backgroundImage !== 'none' ? 1 : 0, bf: cs.backdropFilter !== 'none' ? 1 : 0, z: String(cs.zIndex), r: Math.round(r.width) + 'x' + Math.round(r.height) })
              }
              if (rows.length >= 40) break
            }
            report('DIAG ' + JSON.stringify(rows))
          } catch (err) {
            report('diag-failed ' + String(err))
          }
        }

        // hide competing full-screen wallpaper layers
        const sweep = () => {
          try {
            for (const el of document.body.children) {
              if (el === video || el === backEl || el === tintFilm) continue
              if (el.tagName !== 'DIV') continue
              const cs = window.getComputedStyle(el)
              if (cs.position === 'fixed' && cs.zIndex === '-1') {
                if (el.style.display !== 'none') {
                  el.dataset.wpsHidden = '1'
                  el.style.display = 'none'
                  report('sweep-hid .' + String(el.className).slice(0, 40))
                }
              }
            }
          } catch (err) {}
        }

        // ── shared actions ──
        const setPath = (p) => fetch('/wps-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: p }),
        }).then((r) => r.json())
        const resetPath = () => fetch('/wps-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reset: true }),
        }).then((r) => r.json())

        let storeApi = null

        const applyInfo = (info) => {
          if (info === null || typeof info !== 'object') return
          const path = typeof info.path === 'string' ? info.path : ''
          if (path === currentPath) return
          currentPath = path
          if (info.kind === 'video') mountVideo(info.url)
          else if (typeof info.url === 'string') mountImage(info.url)
          if (storeApi) storeApi.patch({ path })
        }

        const poll = () => {
          fetch('/wps-state')
            .then((res) => { if (!res.ok) throw new Error('http ' + res.status); return res.json() })
            .then(applyInfo)
            .catch((err) => report('poll-error ' + String(err && err.message ? err.message : err)))
        }
        poll()
        sweep()
        const timer = setInterval(poll, 2500)
        const sweeper = setInterval(sweep, 2500)

        // ── settings window integration (slots API, with late-service retry) ──
        let usedFallback = false
        let regTimer = null
        const NS = 'settings.wallpaperFish'
        const getSvc = (name) => { try { return ctx.get ? ctx.get(name) : undefined } catch (err) { return undefined } }
        const registerSettings = (slotsSvc, localeSvc) => {
          try {
            try {
              if (localeSvc && typeof localeSvc.register === 'function') localeSvc.register(NS, {
                zh: { title: '壁纸 / Wallpaper', path: '壁纸路径', pathHint: '图片 (jpg/png/gif) 或视频 (mp4/webm) 的绝对路径', save: '保存', reset: '重置', mask: '内容遮罩', bright: '壁纸亮度', tint: '底调颜色', fit: '填充方式', fitCover: '裁剪填满', fitContain: '完整显示（模糊垫底）', fitFill: '拉伸铺满', dark: '深色', light: '浅色', saved: '已保存，约 2 秒生效' },
                en: { title: 'Wallpaper', path: 'Wallpaper path', pathHint: 'Absolute path of an image or video', save: 'Save', reset: 'Reset', mask: 'Content mask', bright: 'Brightness', tint: 'Tint', fit: 'Fit', fitCover: 'Cover', fitContain: 'Contain (blurred back)', fitFill: 'Stretch', dark: 'Dark', light: 'Light', saved: 'Saved, takes effect in ~2s' },
              })
            } catch (err) {}

            const styles = {
              wrap: { display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '560px' },
              label: { fontSize: '13px', fontWeight: '600' },
              row: { display: 'flex', alignItems: 'center', gap: '10px' },
              lab: { flex: '0 0 76px', fontSize: '12px' },
              input: { flex: 1, padding: '7px 9px', fontSize: '13px', borderRadius: '6px', border: '1px solid rgba(128,128,128,0.4)', background: 'rgba(128,128,128,0.12)', color: 'inherit' },
              btn: { padding: '6px 14px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', border: '1px solid rgba(128,128,128,0.4)', background: '#3964fe', color: '#fff' },
              btn2: { padding: '6px 14px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', border: '1px solid rgba(128,128,128,0.4)', background: 'rgba(128,128,128,0.12)', color: 'inherit' },
              slider: { flex: 1, accentColor: '#3964fe' },
              val: { width: '42px', textAlign: 'right', fontSize: '12px' },
              sel: { fontSize: '12px', padding: '4px 6px', borderRadius: '6px', border: '1px solid rgba(128,128,128,0.4)', background: 'rgba(128,128,128,0.12)', color: 'inherit' },
              status: { fontSize: '12px', opacity: 0.7, minHeight: '16px' },
              modal: { position: 'fixed', right: '24px', bottom: '24px', width: '460px', maxHeight: '60vh', display: 'flex', flexDirection: 'column', borderRadius: '10px', border: '1px solid rgba(128,128,128,0.4)', background: 'rgba(24,24,26,0.97)', color: '#eee', boxShadow: '0 10px 30px rgba(0,0,0,0.4)', zIndex: 1000, overflow: 'hidden' },
              modalHead: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', borderBottom: '1px solid rgba(128,128,128,0.3)' },
              modalList: { overflow: 'auto', padding: '4px 0' },
              modalItem: { padding: '5px 12px', fontSize: '12px', cursor: 'pointer' },
              modalFile: { padding: '5px 12px', fontSize: '12px', cursor: 'pointer', color: '#7fb4ff' },
            }

            const useState = ReactMod.useState
            const useEffect = ReactMod.useEffect

            const Row = ({ t }) => {
              const T = (k, fb) => (t && t[k] !== undefined && t[k] !== null) ? t[k] : fb
              const [path, setPathState] = useState('')
              const [mask, setMaskState] = useState(prefNum('mask', 15))
              const [bright, setBrightState] = useState(prefNum('bright', 100))
              const [tintV, setTintState] = useState(prefStr('wps-tint', 'dark'))
              const [fitV, setFitState] = useState(fitMode())
              const [status, setStatus] = useState('')
              const [browsing, setBrowsing] = useState(false)
              const [browseDir, setBrowseDir] = useState('')
              const [listing, setListing] = useState({ dir: '', parent: null, dirs: [], files: [] })

              useEffect(() => {
                fetch('/wps-state').then((r) => r.json()).then((i) => {
                  if (typeof i.path === 'string' && i.path !== '') setPathState(i.path)
                }).catch(() => {})
              }, [])

              useEffect(() => {
                if (!browsing) return
                const url = '/wps-browse' + (browseDir ? '?dir=' + encodeURIComponent(browseDir) : '')
                fetch(url).then((r) => r.json()).then((d) => {
                  if (d && !d.error) { setListing(d); setBrowseDir(d.dir || '') }
                  else setStatus('目录读取失败: ' + String(d && d.error))
                }).catch((err) => setStatus('目录读取失败: ' + String(err)))
              }, [browsing, browseDir])

              const applyPath = () => setPath(path).then((out) => {
                setStatus(out.ok ? T('saved', '已保存，约 2 秒生效') : '失败: ' + String(out.error))
                return out
              })

              return jsxs('div', { style: styles.wrap, children: [
                jsxs('div', { style: styles.row, children: [
                  jsx('span', { style: Object.assign({}, styles.label, { flex: '0 0 76px' }), children: T('path', '壁纸路径') }),
                  jsx('input', { style: styles.input, value: path, placeholder: T('pathHint', '选择一个图片或视频文件'), onChange: (e) => setPathState(e.target.value) }),
                  jsx('button', { style: styles.btn2, onClick: () => {
                    setStatus('正在打开系统文件选择框…')
                    fetch('/wps-pick' + (path ? '?dir=' + encodeURIComponent(path.slice(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')))) : ''))
                      .then((r) => r.json())
                      .then((d) => {
                        if (d && d.path) {
                          setPathState(d.path)
                          setStatus('已选择：' + d.path)
                          return setPath(d.path).then((out) => setStatus(out.ok ? '已应用' : '失败: ' + String(out.error)))
                        }
                        setStatus(d && d.error ? '选择失败: ' + d.error : '未选择文件')
                      })
                      .catch((err) => setStatus('选择失败: ' + String(err)))
                  }, children: '选择文件…' }),
                  jsx('button', { style: styles.btn, onClick: applyPath, children: T('save', '保存') }),
                  jsx('button', { style: styles.btn2, onClick: () => resetPath().then(() => { setPathState(''); setStatus('已重置') }), children: T('reset', '重置') }),
                  jsx('button', { style: styles.btn2, onClick: () => { runDiag(); setStatus('诊断已上报，等本鱼分析') }, children: '诊断' }),
                ] }),
                jsx('div', { style: styles.status, children: status }),
                jsxs('div', { style: styles.row, children: [
                  jsx('span', { style: styles.lab, children: T('mask', '内容遮罩') }),
                  jsx('input', { type: 'range', min: 0, max: 60, value: mask, style: styles.slider, onChange: (e) => { const v = Number(e.target.value); setMaskState(v); localStorage.setItem('wps-mask', String(v)); applyFx() } }),
                  jsx('span', { style: styles.val, children: mask + '%' }),
                ] }),
                jsxs('div', { style: styles.row, children: [
                  jsx('span', { style: styles.lab, children: T('bright', '壁纸亮度') }),
                  jsx('input', { type: 'range', min: 40, max: 140, value: bright, style: styles.slider, onChange: (e) => { const v = Number(e.target.value); setBrightState(v); localStorage.setItem('wps-bright', String(v)); applyBrightness() } }),
                  jsx('span', { style: styles.val, children: bright + '%' }),
                ] }),
                jsxs('div', { style: styles.row, children: [
                  jsx('span', { style: styles.lab, children: T('tint', '底调颜色') }),
                  jsxs('select', { style: styles.sel, value: tintV, onChange: (e) => { const v = e.target.value; setTintState(v); localStorage.setItem('wps-tint', v); applyFx() }, children: [
                    jsx('option', { value: 'dark', children: T('dark', '深色') }),
                    jsx('option', { value: 'light', children: T('light', '浅色') }),
                  ] }),
                  jsx('span', { style: Object.assign({}, styles.lab, { marginLeft: '16px' }), children: T('fit', '填充方式') }),
                  jsxs('select', { style: styles.sel, value: fitV, onChange: (e) => { const v = e.target.value; setFitState(v); localStorage.setItem('wps-fit', v); currentPath = null; poll() }, children: [
                    jsx('option', { value: 'cover', children: T('fitCover', '裁剪填满') }),
                    jsx('option', { value: 'contain', children: T('fitContain', '完整显示（模糊垫底）') }),
                    jsx('option', { value: 'fill', children: T('fitFill', '拉伸铺满') }),
                  ] }),
                ] }),
                browsing ? jsxs('div', { style: styles.modal, children: [
                  jsxs('div', { style: styles.modalHead, children: [
                    jsx('span', { style: { fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: listing.dir || '…' }),
                    jsx('button', { style: styles.btn2, onClick: () => { if (listing.parent) setBrowseDir(listing.parent) }, children: '↑ 上级' }),
                    jsx('button', { style: styles.btn2, onClick: () => setBrowsing(false), children: '关闭' }),
                  ] }),
                  jsxs('div', { style: styles.modalList, children: [
                    ...listing.dirs.map((d) => jsx('div', { style: styles.modalItem, onClick: () => setBrowseDir((listing.dir ? listing.dir + '\\' : '') + d), children: '📁 ' + d }, 'd:' + d)),
                    ...listing.files.map((f) => jsx('div', { style: styles.modalFile, onClick: () => { setPathState((listing.dir ? listing.dir + '\\' : '') + f.name); setBrowsing(false); setStatus('已选择，点「保存」生效') }, children: '🎬 ' + f.name + '  (' + Math.round(f.size / 1024) + ' KB)' }, 'f:' + f.name)),
                  ] }),
                ] }) : null,
              ] })
            }

            const Section = ({ renderSlot }) => jsx('div', { children: renderSlot(NS + '.row', {}) })

            slotsSvc.inject('settings.section', () => slotsSvc.register({
              name: 'settings.section',
              id: 'wallpaper-fish',
              order: 60,
              label: '壁纸 / Wallpaper',
              locale: NS,
              children: { [NS + '.row']: { kind: 'list', scope: 'root' } },
            }, Section))
            slotsSvc.inject(NS + '.row', () => slotsSvc.register({
              name: NS + '.row',
              id: 'wallpaper-fish-main',
              order: 10,
              locale: NS,
            }, Row))
            report('settings-section-registered')
          } catch (err) {
            report('settings-register-failed ' + String(err && err.message ? err.message : err))
            throw err
          }
        }

        // retry until the slots service shows up (startup order is racy)
        let regAttempts = 0
        const tryRegister = () => {
          const slotsSvc = getSvc('slots')
          const localeSvc = getSvc('locale')
          const ok = !!slotsSvc && typeof slotsSvc.register === 'function' && typeof slotsSvc.inject === 'function'
          report('probe#' + regAttempts + ' slots=' + !!slotsSvc + ' locale=' + !!localeSvc + ' jsx=' + !!jsx + ' react=' + !!ReactMod)
          if (ok && jsx && jsxs && ReactMod && typeof ReactMod.useState === 'function') {
            try {
              registerSettings(slotsSvc, localeSvc)
              return
            } catch (err) {
              report('register-retry-failed')
            }
          }
          regAttempts++
          if (regAttempts < 40) regTimer = setTimeout(tryRegister, 500)
          else { usedFallback = true; mountFallback() }
        }
        tryRegister()

        // ── fallback floating panel (only when slots never became available) ──
        function mountFallback() {
          if (usedFallback === false) return
          report('fallback-panel')
          const root = document.createElement('div')
          root.setAttribute('style', 'position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:8px')
          const form = document.createElement('div')
          form.setAttribute('style', 'display:none;flex-direction:column;gap:6px;width:340px;padding:12px;border-radius:10px;border:1px solid rgba(128,128,128,0.4);background:rgba(30,30,32,0.92);color:#eee;box-shadow:0 8px 24px rgba(0,0,0,0.25)')
          const input = document.createElement('input')
          input.placeholder = '壁纸文件绝对路径'
          input.setAttribute('style', 'width:100%;box-sizing:border-box;padding:6px 8px;font-size:13px;border-radius:6px;border:1px solid rgba(128,128,128,0.4);background:rgba(255,255,255,0.08);color:#eee')
          const statusLine = document.createElement('div')
          statusLine.setAttribute('style', 'font-size:12px;opacity:0.7;min-height:16px')
          const btnRow = document.createElement('div')
          btnRow.setAttribute('style', 'display:flex;gap:8px')
          const mkBtn = (label, primary) => {
            const b = document.createElement('button')
            b.textContent = label
            b.setAttribute('style', 'padding:5px 12px;font-size:12px;border-radius:6px;cursor:pointer;border:1px solid rgba(128,128,128,0.4);' + (primary ? 'background:#3964fe;color:#fff' : 'background:rgba(255,255,255,0.08);color:#eee'))
            return b
          }
          const saveBtn = mkBtn('保存', true)
          const resetBtn = mkBtn('重置', false)
          saveBtn.onclick = () => { setPath(input.value).then((out) => { statusLine.textContent = out.ok ? '已保存' : '失败: ' + String(out.error) }) }
          resetBtn.onclick = () => { resetPath().then(() => { statusLine.textContent = '已重置' }) }
          btnRow.append(saveBtn, resetBtn)
          const toggleBtn = mkBtn('🎨 壁纸', false)
          toggleBtn.onclick = () => {
            const hidden = form.style.display === 'none'
            form.style.display = hidden ? 'flex' : 'none'
            if (hidden) fetch('/wps-state').then((r) => r.json()).then((i) => { if (typeof i.path === 'string') input.value = i.path }).catch(() => {})
          }
          form.append(input, statusLine, btnRow)
          root.append(toggleBtn, form)
          document.body.appendChild(root)
          window.__wpsFallbackRoot = root
        }

        report('apply-done')
        const cleanup = () => {
          clearInterval(timer)
          clearInterval(sweeper)
          clearInterval(fxTimer)
          if (regTimer) clearTimeout(regTimer)
          teardownMedia()
          try { tintFilm.remove() } catch (err) {}
          style.remove()
          fxStyle.remove()
          try { panelStyle.remove() } catch (err) {}
          if (window.__wpsFallbackRoot) { try { window.__wpsFallbackRoot.remove() } catch (err) {} ; window.__wpsFallbackRoot = null }
          if (window.__wpsCleanup === cleanup) window.__wpsCleanup = null
        }
        window.__wpsCleanup = cleanup
        return cleanup
    }
  },
})
