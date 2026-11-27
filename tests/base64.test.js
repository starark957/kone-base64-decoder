const test = require('node:test');
const assert = require('node:assert/strict');
const { AREA, MAX_DEPTH, isCandidate, tryDecode, decodeDeep, findMatches, isHttpUrl } = require('../src/lib/base64.js');

const enc = (s) => Buffer.from(s, 'utf8').toString('base64');
const encUrl = (s) => Buffer.from(s, 'utf8').toString('base64url');
const only = (text, opts) => {
  const ms = findMatches(text, opts);
  assert.equal(ms.length, 1, `한 개를 기대했지만 ${ms.length}개: ${JSON.stringify(ms)}`);
  return ms[0];
};

test.describe('바꿔야 하는 문자열', () => {
  test('한글 UTF-8', () => {
    const m = only('7JWI64WV7ZWY7IS47JqU');
    assert.equal(m.text, '안녕하세요');
    assert.equal(m.depth, 1);
  });

  test('패딩(=)이 빠진 Base64', () => {
    const padded = enc('코네 디코더 테스트');
    assert.ok(padded.endsWith('='));
    assert.equal(only(padded.replace(/=+$/, '')).text, '코네 디코더 테스트');
  });

  test('URL-safe Base64 (-, _ 포함)', () => {
    const src = '<<???>> 물음표와 꺾쇠 <<???>>';
    const token = encUrl(src);
    assert.match(token, /[-_]/);
    assert.equal(only(token).text, src);
  });

  test('문장 중간에 끼어 있는 Base64는 그 구간만', () => {
    const token = enc('https://example.com/abc');
    const text = `링크: ${token} 입니다`;
    const m = only(text);
    assert.equal(text.slice(m.start, m.end), token);
    assert.equal(m.text, 'https://example.com/abc');
  });

  test('코네 실제 형태: 52자 URL', () => {
    const token = enc('https://example.com/some/long/path?x=1');
    const m = only(`링크: ${token}`);
    assert.ok(isHttpUrl(m.text));
  });

  test('두 번 인코딩된 URL은 끝까지 풀린다', () => {
    const m = only(enc(enc('https://example.com/nested')));
    assert.equal(m.text, 'https://example.com/nested');
    assert.equal(m.depth, 2);
  });

  test('중첩은 최대 10단계에서 멈춘다', () => {
    let s = '안전장치 확인용 문장입니다';
    for (let i = 0; i < 12; i++) s = enc(s);
    const r = decodeDeep(s);
    assert.equal(r.depth, MAX_DEPTH);
  });

  test('한 텍스트에 여러 개', () => {
    const ms = findMatches(`${enc('첫 번째 문장입니다')} 그리고 ${enc('두 번째 문장입니다')}`);
    assert.deepEqual(ms.map((m) => m.text), ['첫 번째 문장입니다', '두 번째 문장입니다']);
  });

  test('끝에 줄바꿈이 붙은 결과(echo | base64)는 걷어 낸다', () => {
    assert.equal(only('[번역] T3NhbmFpCg==', AREA.title).text, 'Osanai');
    assert.equal(only(enc('  본문 속 문장입니다\n\n')).text, '본문 속 문장입니다');
  });

  test('제목은 안쪽 줄바꿈도 한 줄로, 본문은 줄바꿈 유지', () => {
    assert.equal(only(enc('첫 줄\r\n  둘째 줄'), AREA.title).text, '첫 줄 둘째 줄');
    assert.equal(only(enc('첫 줄입니다\n둘째 줄입니다')).text, '첫 줄입니다\n둘째 줄입니다');
  });

  test('제목 속 Qw== → C', () => {
    assert.equal(only('[번역] Qw==', AREA.title).text, 'C');
  });

  test('제목 속 16자 이상은 패딩 없이도', () => {
    const token = enc('제목 속 긴 문장').replace(/=+$/, '');
    assert.ok(token.length >= 16);
    assert.equal(only(`공지 ${token}`, AREA.title).text, '제목 속 긴 문장');
  });

  test('XSS 문자열도 텍스트로 디코딩된다 (DOM에는 textContent로만 넣음)', () => {
    const m = only(enc('<img src=x onerror=alert(1)>'));
    assert.equal(m.text, '<img src=x onerror=alert(1)>');
    assert.equal(isHttpUrl(m.text), false);
  });
});

test.describe('그대로 둬야 하는 문자열', () => {
  const none = (text, opts) => assert.deepEqual(findMatches(text, opts), []);

  test('긴 영단어', () => none('internationalization'));
  test('SHA-256 Hex 해시', () => none('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'));
  test('본문 속 15자 이하 Base64 (최소 길이 미달)', () => none('SGVsbG8gS29u'));
  test('본문 기준에서는 Qw==도 그대로', () => none('Qw=='));
  test('제목 속 RJ071591 (16자 미만, 패딩 없음)', () => none('RJ071591 작품 번역', AREA.title));
  test('제목 속 짧은 일반 단어', () => none('Test 2024 Re0', AREA.title));
  test('이미지 등 바이너리 Base64', () =>
    none('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='));
  test('코네 게시물 ID (22자)', () => none('c2ArRWdThcQlvW0oQ56j0b'));
  test('코네 목록 링크 경로', () => none('/s/somisoft/aiMym-yWvpQkf91CO9Ekeb'));
  test('제어문자가 나오는 디코딩', () => none(enc('\u0001\u0002 제어문자 포함 문장')));
  test('일반 URL', () => none('https://kone.gg/s/somisoft?p=2'));
  test('빈 문자열', () => none(''));
});

test.describe('부분 함수', () => {
  test('isCandidate: 길이 % 4 === 1 은 제외', () => {
    assert.equal(isCandidate('ABCDEabcde12345678901'), false); // 21자
  });

  test('tryDecode: 공백뿐인 결과는 null', () => {
    assert.equal(tryDecode(enc('     ')), null);
  });

  test('isHttpUrl', () => {
    assert.equal(isHttpUrl('https://example.com'), true);
    assert.equal(isHttpUrl('http://example.com/a b'), false);
    assert.equal(isHttpUrl('javascript:alert(1)'), false);
    assert.equal(isHttpUrl('ftp://example.com'), false);
    assert.equal(isHttpUrl('see https://example.com'), false);
  });

  test('디코딩 결과가 javascript: 스킴이면 링크 아님', () => {
    const m = only(enc('javascript:alert(1)'));
    assert.equal(isHttpUrl(m.text), false);
  });
});
