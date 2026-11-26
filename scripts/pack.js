// 배포용 zip을 만든다: dist/kone-base64-decoder-<버전>.zip
// 확장에 필요한 파일(manifest.json, icons/, src/)만 넣는다. 외부 패키지 없이 Node 기본 모듈만 쓴다.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const INCLUDE = ['manifest.json', 'icons', 'src'];

/** 포함할 파일 목록(저장소 기준 경로, '/' 구분, 정렬) */
function listFiles() {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(ROOT, rel);
    if (fs.statSync(abs).isDirectory()) {
      for (const name of fs.readdirSync(abs)) walk(path.posix.join(rel, name));
    } else {
      out.push(rel);
    }
  };
  for (const rel of INCLUDE) walk(rel);
  return out.sort();
}

/** manifest가 가리키는 파일이 모두 목록에 있는지 확인 */
function checkManifest(manifest, files) {
  const set = new Set(files);
  const refs = [
    ...manifest.content_scripts.flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
    manifest.action.default_popup,
    ...Object.values(manifest.action.default_icon || {}),
    ...Object.values(manifest.icons || {}),
    ...(manifest.options_ui ? [manifest.options_ui.page] : []),
  ];
  const missing = refs.filter((f) => !set.has(f));
  if (missing.length) throw new Error(`manifest가 가리키는 파일이 없습니다: ${missing.join(', ')}`);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 고정 시각(1980-01-01 00:00)으로 써서 같은 내용이면 같은 zip이 나오게 한다. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // 필요 버전
    local.writeUInt16LE(0x0800, 6); // UTF-8 파일 이름
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // 만든 버전
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) {
    throw new Error(`버전이 다릅니다: manifest ${manifest.version}, package.json ${pkg.version}`);
  }
  const files = listFiles();
  checkManifest(manifest, files);

  const zip = makeZip(files.map((name) => ({ name, data: fs.readFileSync(path.join(ROOT, name)) })));
  const outDir = path.join(ROOT, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `kone-base64-decoder-${manifest.version}.zip`);
  fs.writeFileSync(out, zip);
  console.log(`${path.relative(ROOT, out)} (${files.length}개 파일, ${(zip.length / 1024).toFixed(1)} KB)`);
}

if (require.main === module) main();
module.exports = { listFiles, makeZip, crc32 };
