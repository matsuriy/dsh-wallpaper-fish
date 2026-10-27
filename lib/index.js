// dsh-wallpaper-skin host — local fork (fish edition) v1.4.1-fish
// Changes vs upstream 1.4.1:
//  - No dependency on the host 'settings' service (unavailable to third-party
//    plugins in this dsh build). Path is persisted in a JSON file instead.
//  - Uses node:fs directly (ctx.fs sandbox cannot read files outside profile).
//  - Routes renamed to /wps-state and /wps-bytes to avoid outer proxy 400s.

import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'

const STATE_ROUTE = '/wps-state'
const BYTES_ROUTE = '/wps-bytes'
const DEBUG_ROUTE = '/wallpaper-skin-debug'
const PICK_ROUTE = '/wps-pick'
const BROWSE_ROUTE = '/wps-browse'

const MEDIA_EXT = new Set(['mp4', 'webm', 'mov', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'])

const CFG_FILE = process.env.DSH_HOME
  ? join(process.env.DSH_HOME, 'wallpaper-skin.config.json')
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'wallpaper-skin.config.json')

const MIME = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

function mimeOf(path) {
  const extMatch = /\.([a-z0-9]+)$/i.exec(path)
  return MIME[(extMatch === null ? '' : extMatch[1].toLowerCase())] ?? 'application/octet-stream'
}

function readPersisted() {
  try {
    if (!existsSync(CFG_FILE)) return ''
    const parsed = JSON.parse(readFileSync(CFG_FILE, 'utf8'))
    return typeof parsed.path === 'string' ? parsed.path.trim() : ''
  } catch {
    return ''
  }
}

export default {
  name: 'dsh-wallpaper-skin',
  inject: ['webServer'],
  apply(ctx, config = {}) {
    const composed = typeof config.path === 'string' ? config.path : ''

    const events = []
    const record = (text) => {
      events.push(new Date().toISOString().slice(11, 23) + ' ' + text)
      if (events.length > 300) events.splice(0, events.length - 300)
    }
    record('host-apply fish.1')

    const readPath = () => readPersisted() || composed

    let cachePath = null
    let cacheBytes = null
    const load = () => {
      const path = readPath()
      if (path === '') throw new Error('empty-path')
      if (cachePath === path && cacheBytes !== null) return cacheBytes
      const data = readFileSync(path)
      cachePath = path
      cacheBytes = data
      record('media-loaded ' + path.slice(-60))
      return data
    }

    const disposers = []

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: STATE_ROUTE,
      handler: async (req, res) => {
        const respond = (payload, status = 200) => {
          res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(payload))
        }
        if (req.method === 'GET') {
          const path = readPath()
          respond({ path, kind: mimeOf(path).startsWith('video/') ? 'video' : 'image', url: BYTES_ROUTE + '?v=' + encodeURIComponent(path) })
          return
        }
        if (req.method === 'POST') {
          const chunks = []
          let size = 0
          for await (const chunk of req) {
            size += chunk.length
            if (size > 64 * 1024) {
              respond({ ok: false, error: 'payload-too-large' }, 413)
              return
            }
            chunks.push(chunk)
          }
          let payload = {}
          try {
            payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch {
            respond({ ok: false, error: 'bad-json' }, 400)
            return
          }
          try {
            if (payload.reset === true) {
              if (existsSync(CFG_FILE)) unlinkSync(CFG_FILE)
            } else {
              const next = typeof payload.path === 'string' ? payload.path.trim() : ''
              if (next === '') {
                respond({ ok: false, error: 'empty-path' })
                return
              }
              if (!existsSync(next)) {
                respond({ ok: false, error: 'file-not-found' })
                return
              }
              writeFileSync(CFG_FILE, JSON.stringify({ path: next }, null, 2), 'utf8')
            }
          } catch (error) {
            respond({ ok: false, error: String(error && error.message ? error.message : error) })
            return
          }
          const path = readPath()
          cachePath = null
          cacheBytes = null
          respond({ ok: true, path, kind: mimeOf(path).startsWith('video/') ? 'video' : 'image' })
          return
        }
        respond({ ok: false, error: 'method-not-allowed' }, 405)
      },
    }))
    record('state-route-registered')

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: DEBUG_ROUTE,
      handler: async (req, res) => {
        const rawUrl = new URL(req.url ?? '/', 'http://x')
        const entry = rawUrl.searchParams.get('e')
        if (entry !== null && entry !== '') record('[browser] ' + entry)
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ file: CFG_FILE, events }))
      },
    }))
    record('debug-route-registered')

    // folder browser for the settings UI: GET /wps-browse?dir=<abs path>
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: BROWSE_ROUTE,
      handler: async (req, res) => {
        const respond = (payload, status = 200) => {
          res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(payload))
        }
        try {
          const rawUrl = new URL(req.url ?? '/', 'http://x')
          const q = rawUrl.searchParams.get('dir')
          const current = q !== null && q.trim() !== '' ? resolve(q.trim()) : dirname(readPath() || '.')
          const entries = readdirSync(current, { withFileTypes: true })
          const dirs = []
          const files = []
          for (const ent of entries) {
            if (ent.name.startsWith('.')) continue
            try {
              if (ent.isDirectory()) dirs.push(ent.name)
              else if (ent.isFile()) {
                const ext = ent.name.slice(ent.name.lastIndexOf('.') + 1).toLowerCase()
                if (MEDIA_EXT.has(ext)) {
                  const st = statSync(join(current, ent.name))
                  files.push({ name: ent.name, size: st.size })
                }
              }
            } catch {}
          }
          dirs.sort((a, b) => a.localeCompare(b))
          files.sort((a, b) => a.name.localeCompare(b.name))
          const parent = current.endsWith(sep) && current.length <= 3 ? null : dirname(current)
          respond({ dir: current, parent: parent === current ? null : parent, dirs, files })
        } catch (error) {
          respond({ error: String(error && error.message ? error.message : error) }, 400)
        }
      },
    }))
    record('browse-route-registered')

    // native Windows file picker: GET /wps-pick
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: PICK_ROUTE,
      handler: async (req, res) => {
        const respond = (payload, status = 200) => {
          res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(payload))
        }
        try {
          const rawUrl = new URL(req.url ?? '/', 'http://x')
          const startDir = rawUrl.searchParams.get('dir') || (readPath() ? dirname(readPath()) : '')
          const initial = startDir && existsSync(startDir) ? startDir.replace(/'/g, "''") : ''
          const script = [
            'Add-Type -AssemblyName System.Windows.Forms | Out-Null',
            '$d = New-Object System.Windows.Forms.OpenFileDialog',
            "$d.Title = '选择壁纸（图片或视频）'",
            "$d.Filter = '媒体文件|*.jpg;*.jpeg;*.png;*.webp;*.gif;*.bmp;*.avif;*.mp4;*.webm;*.mov|所有文件|*.*'",
            initial ? "$d.InitialDirectory = '" + initial + "'" : '',
            "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.FileName) }",
          ].filter(Boolean).join('; ')
          const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: false })
          let out = ''
          child.stdout.on('data', (chunk) => { out += chunk.toString('utf8') })
          child.stderr.on('data', () => {})
          const killer = setTimeout(() => { try { child.kill() } catch {} }, 180000)
          child.on('close', () => {
            clearTimeout(killer)
            const picked = out.trim()
            respond({ path: picked && existsSync(picked) ? picked : '' })
          })
        } catch (error) {
          respond({ error: String(error && error.message ? error.message : error) }, 400)
        }
      },
    }))
    record('pick-route-registered')

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: BYTES_ROUTE,
      handler: async (req, res) => {
        try {
          const data = await load()
          const total = data.length
          res.setHeader('Content-Type', mimeOf(readPath()))
          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Cache-Control', 'no-store')
          const range = typeof req.headers.range === 'string' ? req.headers.range : null
          if (range !== null) {
            const match = /bytes=(\d*)-(\d*)/.exec(range)
            let start = 0
            let end = total - 1
            if (match !== null) {
              if (match[1] !== '') start = parseInt(match[1], 10)
              if (match[2] !== '') end = parseInt(match[2], 10)
            }
            if (start >= total || start > end) {
              res.writeHead(416, { 'Content-Range': 'bytes */' + total })
              res.end()
              return
            }
            end = Math.min(end, total - 1)
            res.writeHead(206, {
              'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
              'Content-Length': end - start + 1,
            })
            res.end(data.subarray(start, end + 1))
            return
          }
          res.writeHead(200, { 'Content-Length': total })
          res.end(data)
        } catch (error) {
          record('media-error ' + String(error && error.message ? error.message : error))
          if (!res.headersSent) res.writeHead(404)
          res.end()
        }
      },
    }))
    record('bytes-route-registered')

    ctx.effect(() => () => {
      for (const dispose of disposers) {
        try { dispose() } catch {}
      }
    })
  },
}
