import type {
  Connection,
  ConnectionFlag,
  Diagnostic,
  Frame,
  FrameRef,
  Project,
  Segment,
  Source,
  SourceDiagnostics,
  StreamBytes,
} from '~/api/types'
import { bytesToBase64 } from '~/utils/bytes'

// Пример данных: условный стенд «регулятор РТ-2» с бинарным протоколом поверх TCP, порт 5020.
// Формат сообщения: AA 55 <длина> <команда> <данные…> <xor всех предыдущих байтов>, длина = данные + 1.

const BASE_TIME = Date.UTC(2026, 9, 10, 14, 2, 0)

export const SHA = {
  base: '9f2c7e10b4a35d8c61e0f2a9b7c4d3e5a1f08b6c2d9e4f7a3b5c8d1e6f2a41ab',
  setParam: 'c41d02e7f9a83b6c5d1e0f7a2b9c8d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c',
  extra: '03de5f1a7c9b2e4d6f8a0b1c3d5e7f9a2b4c6d8e0f1a3b5c7d9e2f4a6b8c77c0',
} as const

export const project: Project = {
  name: 'rt2-stand',
  path: '~/Исследования/rt2-stand.protoledger',
  formatVersion: 1,
  engineVersion: '0.1.0',
  settings: { overlapPolicy: 'first', checksumPolicy: 'warn' },
  sourceCount: 3,
}

export function initialSources(): Source[] {
  return [
    { sha256: SHA.base, importId: 'imp-0001', name: 'base-session.pcapng', format: 'pcapng', sizeBytes: 41_208_332, status: 'ready', frameCount: 160_418, connectionCount: 9 },
    { sha256: SHA.setParam, importId: 'imp-0002', name: 'set-param-37.pcapng', format: 'pcapng', sizeBytes: 26_310_004, status: 'importing', frameCount: 0, connectionCount: 0 },
    { sha256: SHA.extra, importId: 'imp-0003', name: 'extra-1000.pcap', format: 'pcap', sizeBytes: 22_517_120, status: 'ready', frameCount: 87_894, connectionCount: 5 },
  ]
}

const diagnostics: Record<string, Diagnostic[]> = {
  [SHA.base]: [
    { code: 'bad_checksum', severity: 'warning', title: 'Неверная контрольная сумма TCP', detail: 'Плохие суммы только от 10.0.0.12 — похоже на разгрузку подсчёта на сетевую карту (offloading).', count: 3, frameNumbers: [20311, 20318, 20402] },
    { code: 'non_ip', severity: 'info', title: 'Кадры не IPv4', detail: 'ARP и LLDP пропущены: не относятся к TCP.', count: 57, frameNumbers: [2, 9, 15] },
  ],
  [SHA.setParam]: [],
  [SHA.extra]: [
    { code: 'ipv6_skipped', severity: 'info', title: 'IPv6 не поддерживается', detail: 'Кадры IPv6 пропущены — ограничение реализации, а не свойство протокола.', count: 412, frameNumbers: [101, 102, 140] },
    { code: 'non_tcp', severity: 'info', title: 'Кадры не TCP', detail: 'UDP и ICMP пропущены.', count: 88, frameNumbers: [7, 33, 34] },
  ],
}

export function sourceDiagnostics(sha256: string, frameCount: number): SourceDiagnostics {
  const items = diagnostics[sha256] ?? []
  const skipped = items.filter(d => d.code !== 'bad_checksum').reduce((n, d) => n + d.count, 0)
  return { sha256, frames: { total: frameCount, parsed: frameCount - skipped, skipped }, items }
}

interface ConnSpec {
  n: number
  source: string
  clientPort: number
  client?: string
  server?: string
  serverPort?: number
  frames: number
  close: Connection['close']
  flags: ConnectionFlag[]
  rolesKnown?: boolean
  minute: number
}

const specs: ConnSpec[] = [
  { n: 1, source: SHA.base, clientPort: 51540, frames: 1204, close: 'fin', flags: [], minute: 0 },
  { n: 2, source: SHA.base, clientPort: 51544, frames: 3917, close: 'fin', flags: ['gaps', 'ambiguous', 'retransmissions'], minute: 2 },
  { n: 3, source: SHA.base, clientPort: 51560, frames: 88, close: 'open', flags: ['no_syn'], rolesKnown: false, minute: 9 },
  { n: 4, source: SHA.base, clientPort: 51571, frames: 2016, close: 'fin', flags: ['bad_checksum'], minute: 11 },
  { n: 5, source: SHA.base, clientPort: 44120, client: '10.0.0.31', frames: 640, close: 'rst', flags: [], minute: 15 },
  { n: 6, source: SHA.base, clientPort: 50211, server: '10.0.0.1', serverPort: 443, frames: 31, close: 'fin', flags: [], minute: 16 },
  { n: 7, source: SHA.base, clientPort: 51590, frames: 512, close: 'fin', flags: ['reused_ports'], minute: 20 },
  { n: 8, source: SHA.base, clientPort: 50330, server: '10.0.0.1', serverPort: 53, frames: 12, close: 'fin', flags: [], minute: 22 },
  { n: 9, source: SHA.base, clientPort: 51602, frames: 1730, close: 'fin', flags: ['truncated'], minute: 25 },
  { n: 1, source: SHA.extra, clientPort: 52010, frames: 2210, close: 'fin', flags: [], minute: 68 },
  { n: 2, source: SHA.extra, clientPort: 52014, frames: 980, close: 'fin', flags: ['retransmissions'], minute: 71 },
  { n: 3, source: SHA.extra, clientPort: 52020, frames: 1442, close: 'fin', flags: [], minute: 74 },
  { n: 4, source: SHA.extra, clientPort: 50600, server: '10.0.0.1', serverPort: 443, frames: 64, close: 'fin', flags: [], minute: 76 },
  { n: 5, source: SHA.extra, clientPort: 52031, frames: 301, close: 'open', flags: ['gaps'], minute: 79 },
]

function connId(spec: ConnSpec) {
  return `${spec.source.slice(0, 8)}:c${String(spec.n).padStart(4, '0')}`
}

function iso(ms: number) {
  return new Date(ms).toISOString().replace('Z', '000000Z')
}

const streamCache = new Map<string, BuiltStream>()

export function connections(): Connection[] {
  return specs.map((spec) => {
    const id = connId(spec)
    const start = BASE_TIME + spec.minute * 60_000
    const ab = buildStream(`${id}:ab`, spec)
    const ba = buildStream(`${id}:ba`, spec)
    return {
      id,
      source: spec.source,
      a: { address: spec.client ?? '10.0.0.12', port: spec.clientPort },
      b: { address: spec.server ?? '10.0.0.50', port: spec.serverPort ?? 5020 },
      rolesKnown: spec.rolesKnown ?? true,
      firstFrameTime: iso(start),
      lastFrameTime: iso(start + spec.frames * 180),
      frameCount: spec.frames,
      close: spec.close,
      flags: spec.flags,
      streams: [ab.summary, ba.summary],
    }
  })
}

interface BuiltStream {
  summary: Connection['streams'][number]
  bytes: Uint8Array
  segments: { start: number, end: number, status: Segment['status'], frames: FrameRef[], variant?: Uint8Array }[]
  source: string
  baseTime: number
}

// Детерминированный генератор, чтобы пример не менялся между перезагрузками.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function message(cmd: number, data: number[]): number[] {
  const body = [0xAA, 0x55, data.length + 1, cmd, ...data]
  return [...body, body.reduce((x, b) => x ^ b, 0)]
}

const PARAMS = [21, 37, 1000, 250, 4, 512]

function protocolBytes(dir: 'ab' | 'ba', seed: number, target: number): number[] {
  const rand = rng(seed)
  const out: number[] = []
  let i = 0
  while (out.length < target) {
    const value = PARAMS[i % PARAMS.length] ?? 21
    const kind = i % 5
    if (dir === 'ab') {
      if (kind === 4) out.push(...message(0x30, [0x41, 0x42, 0x43, 0x0A]))
      else if (kind % 2 === 0) out.push(...message(0x10, [value >> 8, value & 0xFF]))
      else out.push(...message(0x20, []))
    }
    else {
      if (kind % 2 === 0) out.push(...message(0x11, [0x00]))
      else {
        const m = value * 10 + Math.floor(rand() * 3)
        out.push(...message(0x21, [(m >> 8) & 0xFF, m & 0xFF]))
      }
    }
    i++
  }
  return out.slice(0, target)
}

function buildStream(stream: string, spec: ConnSpec): BuiltStream {
  const cached = streamCache.get(stream)
  if (cached) return cached
  const dir = stream.endsWith(':ab') ? 'ab' : 'ba'
  const isDevice = (spec.serverPort ?? 5020) === 5020
  const length = Math.max(64, Math.round(spec.frames * (dir === 'ab' ? 0.97 : 0.62)))
  const seed = spec.n * 7919 + (dir === 'ab' ? 1 : 2) + spec.source.charCodeAt(0)
  const rand = rng(seed)
  const raw = isDevice ? protocolBytes(dir, seed, length) : Array.from({ length }, () => Math.floor(rand() * 256))
  const bytes = Uint8Array.from(raw)

  const segments: BuiltStream['segments'] = []
  let frame = 1000 + (spec.n - 1) * 6000 + (dir === 'ab' ? 0 : 3000)
  let pos = 0
  const hasGap = spec.flags.includes('gaps')
  const hasAmb = spec.flags.includes('ambiguous')
  const hasRetr = spec.flags.includes('retransmissions')
  while (pos < length) {
    if (hasGap && dir === 'ab' && pos >= 0xC0 && pos < 0x100) {
      segments.push({ start: pos, end: 0x100, status: 'gap', frames: [] })
      pos = 0x100
      frame += 4
      continue
    }
    const size = Math.min(length - pos, 18 + Math.floor(rand() * 40))
    const frames: FrameRef[] = [{ source: spec.source, frameNo: frame, duplicate: false }]
    if (hasRetr && segments.length % 9 === 4) frames.push({ source: spec.source, frameNo: frame + 2, duplicate: true })
    if (hasAmb && dir === 'ab' && pos >= 0x120 && pos < 0x140 && !segments.some(s => s.status === 'ambiguous')) {
      const variant = bytes.slice(pos, pos + 6).map(b => b ^ 0x5A)
      segments.push({ start: pos, end: pos + 6, status: 'ambiguous', frames: [...frames, { source: spec.source, frameNo: frame + 1, duplicate: false }], variant })
      pos += 6
      frame += 4
      continue
    }
    segments.push({ start: pos, end: pos + size, status: 'data', frames })
    pos += size
    frame += hasRetr ? 3 : 2
  }

  const gapBytes = segments.filter(s => s.status === 'gap').reduce((n, s) => n + s.end - s.start, 0)
  const ambiguousBytes = segments.filter(s => s.status === 'ambiguous').reduce((n, s) => n + s.end - s.start, 0)
  const built: BuiltStream = {
    summary: {
      id: stream,
      direction: dir === 'ab' ? 'a_to_b' : 'b_to_a',
      length,
      dataBytes: length - gapBytes - ambiguousBytes,
      gapBytes,
      ambiguousBytes,
      startAvailable: !spec.flags.includes('no_syn'),
    },
    bytes,
    segments,
    source: spec.source,
    baseTime: BASE_TIME + spec.minute * 60_000,
  }
  streamCache.set(stream, built)
  return built
}

function findStream(stream: string): BuiltStream {
  const cached = streamCache.get(stream)
  if (cached) return cached
  connections()
  const built = streamCache.get(stream)
  if (!built) throw new Error(`Поток ${stream} не найден`)
  return built
}

export function streamBytes(stream: string, from: number, len: number): StreamBytes {
  const s = findStream(stream)
  const streamLength = s.summary.length
  const start = Math.min(Math.max(0, from), streamLength)
  const end = Math.min(streamLength, start + len)
  const segments: Segment[] = s.segments
    .filter(seg => seg.end > start && seg.start < end)
    .map((seg) => {
      const a = Math.max(seg.start, start)
      const b = Math.min(seg.end, end)
      const out: Segment = {
        start: a,
        end: b,
        status: seg.status,
        data: seg.status === 'gap' ? null : bytesToBase64(s.bytes.slice(a, b)),
        frames: seg.frames,
      }
      if (seg.status === 'ambiguous' && seg.variant) {
        const variant = seg.variant.slice(a - seg.start, b - seg.start)
        out.variants = [
          { data: out.data ?? '', frames: seg.frames.slice(0, 1) },
          { data: bytesToBase64(variant), frames: seg.frames.slice(-1) },
        ]
      }
      return out
    })
  return { stream, from: start, length: end - start, streamLength, segments }
}

export function frame(source: string, frameNo: number): Frame {
  for (const spec of specs.filter(s => s.source === source)) {
    for (const dir of ['ab', 'ba'] as const) {
      const s = buildStream(`${connId(spec)}:${dir}`, spec)
      const seg = s.segments.find(x => x.frames.some(f => f.frameNo === frameNo))
      if (!seg) continue
      const ref = seg.frames.find(f => f.frameNo === frameNo)
      const payload = s.bytes.slice(seg.start, seg.end)
      const headerLen = 54
      const data = new Uint8Array(headerLen + payload.length)
      data.set(payload, headerLen)
      const client = { address: spec.client ?? '10.0.0.12', port: spec.clientPort }
      const server = { address: spec.server ?? '10.0.0.50', port: spec.serverPort ?? 5020 }
      const [src, dst] = dir === 'ab' ? [client, server] : [server, client]
      const badChecksum = spec.flags.includes('bad_checksum') && frameNo % 7 === 0
      return {
        source,
        frameNo,
        time: iso(s.baseTime + (frameNo % 3000) * 4),
        fileOffset: 24 + frameNo * 162,
        capturedLength: data.length,
        originalLength: data.length,
        data: bytesToBase64(data),
        ethernet: { src: '00:1b:21:3a:4f:10', dst: '00:1b:21:3a:4f:50', etherType: 0x0800 },
        ipv4: { src: src.address, dst: dst.address, ttl: 64, protocol: 6, headerLength: 20 },
        tcp: {
          srcPort: src.port,
          dstPort: dst.port,
          seq: 1_000_000 + seg.start,
          ack: 2_000_000,
          flags: ['psh', 'ack'],
          window: 64240,
          headerLength: 20,
          checksum: badChecksum ? 'bad' : 'ok',
        },
        payload: { offset: headerLen, length: payload.length },
        streamRange: { stream: s.summary.id, start: seg.start, end: seg.end, duplicate: ref?.duplicate ?? false },
        diagnostics: badChecksum ? [{ code: 'bad_checksum', severity: 'warning', title: 'Неверная контрольная сумма TCP' }] : [],
      }
    }
  }
  throw new Error(`Кадр ${frameNo} не найден`)
}
