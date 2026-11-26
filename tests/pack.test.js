const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { listFiles, makeZip, crc32 } = require('../scripts/pack.js');

test('패키지에는 manifest·아이콘·src만 들어간다', () => {
  const files = listFiles();
  assert.ok(files.includes('manifest.json'));
  assert.ok(files.includes('icons/icon-128.png'));
  assert.ok(files.includes('src/content/content.js'));
  for (const f of files) {
    assert.match(f, /^(manifest\.json|icons\/|src\/)/, `들어가면 안 되는 파일: ${f}`);
  }
});

test('crc32 표준 검사값', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('zip: 항목을 다시 읽으면 원래 내용이 나온다', () => {
  const entries = [
    { name: 'a.txt', data: Buffer.from('가나다 '.repeat(50)) },
    { name: 'dir/b.bin', data: Buffer.from([1, 2, 3]) },
  ];
  const zip = makeZip(entries);
  // 중앙 디렉터리 끝 레코드
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), 2);
  // 로컬 헤더를 따라가며 내용 확인
  let p = 0;
  for (const e of entries) {
    assert.equal(zip.readUInt32LE(p), 0x04034b50);
    const method = zip.readUInt16LE(p + 8);
    const size = zip.readUInt32LE(p + 18);
    const nameLen = zip.readUInt16LE(p + 26);
    assert.equal(zip.subarray(p + 30, p + 30 + nameLen).toString(), e.name);
    const body = zip.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    const data = method === 8 ? zlib.inflateRawSync(body) : body;
    assert.deepEqual(data, e.data);
    assert.equal(zip.readUInt32LE(p + 14), crc32(e.data));
    p += 30 + nameLen + size;
  }
});
