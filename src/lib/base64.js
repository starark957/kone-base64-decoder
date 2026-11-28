// Base64 감지·디코딩 순수 함수. DOM과 브라우저 API에 의존하지 않는다(단위 테스트 대상).
// 후보는 넓게 찾고, "디코딩했을 때 정상적인 UTF-8 문장이 나오는가"로 엄격하게 거른다.
(function (root) {
  'use strict';

  /**
   * 앞뒤가 Base64 문자가 아닌 덩어리. `Qw==`처럼 패딩 앞이 2자뿐인 경우도 잡도록 본체는 2자부터 받고,
   * 패딩을 포함한 전체 길이 기준(영역별 최소 길이)은 isCandidate에서 본다.
   */
  const CANDIDATE = /(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/_-]{2,}={0,2}(?![A-Za-z0-9+/=_-])/g;

  /**
   * 영역별 기준. 본문·제목 모두 4자부터 본다. 16자 미만의 짧은 덩어리는 더 엄격하게 본다(isCandidate, tryDecode):
   * - 패딩(=)이 있으면: 정규형이고 결과에 글자나 숫자가 있을 때
   * - 패딩이 없으면: 원래 패딩이 필요 없는 8·12자만, 결과가 자연스러운 글(looksNatural)일 때
   * 제목은 결과를 한 줄로 만든다(tidy).
   * 설정에서 짧은 덩어리를 끄면 `{ ...AREA.body, allowShort: false }`처럼 넘겨 16자 이상만 본다.
   */
  const AREA = Object.freeze({
    body: Object.freeze({ minLength: 4, shortNeedsPadding: true }),
    title: Object.freeze({ minLength: 4, shortNeedsPadding: true, singleLine: true }),
  });

  const MAX_DEPTH = 10;
  /** 이보다 긴 덩어리는 이미지 등 바이너리일 가능성이 높아 시도하지 않는다. */
  const MAX_TOKEN_LENGTH = 100000;
  /** 이 길이 미만은 "짧은 덩어리": 추가 검사를 받는다. */
  const PADDING_FREE_LENGTH = 16;
  /** 패딩 없이도 받는 짧은 덩어리 길이 (6·9바이트라 원래 패딩이 붙지 않는 길이) */
  const BARE_SHORT_LENGTHS = [8, 12];

  const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
  /** 글자나 숫자가 하나라도 있는지 (`!`처럼 기호만 나오는 짧은 결과를 거른다) */
  const MEANINGFUL = /[\p{L}\p{N}]/u;
  const WHOLE_TOKEN = /^[A-Za-z0-9+/_-]+={0,2}$/;

  const utf8 = new TextDecoder('utf-8', { fatal: true });

  /** 짧은 덩어리인지 (패딩 포함 길이 기준) */
  function isShort(token) {
    return token.length < PADDING_FREE_LENGTH;
  }

  /** 패딩 없는 짧은 덩어리인지 */
  function isBareShort(token) {
    return isShort(token) && !token.endsWith('=');
  }

  /**
   * 흔히 쓰는 한글(KS X 1001 완성형 2350자)과 한자(JIS X 0208 6355자) 집합.
   * 옛 인코딩 표를 디코딩해 만들고, 처음 필요할 때 한 번만 만든다. 만들 수 없는 환경이면 빈 집합.
   */
  let commonChars = null;
  function common() {
    if (commonChars) return commonChars;
    const table = (encoding, leads, trails) => {
      const bytes = [];
      for (const hi of leads) for (const lo of trails) bytes.push(hi, lo);
      try {
        return new Set(new TextDecoder(encoding).decode(new Uint8Array(bytes)));
      } catch {
        return new Set();
      }
    };
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    commonChars = {
      hangul: table('euc-kr', range(0xb0, 0xc8), range(0xa1, 0xfe)),
      kanji: table('shift_jis', [...range(0x88, 0x9f), ...range(0xe0, 0xea)], range(0x40, 0xfc).filter((b) => b !== 0x7f)),
    };
    return commonChars;
  }

  const HANGUL_TEXT = /^[가-힣]+(?: [가-힣]+)*[.!?~]?$/;
  /** 가나(U+3040–30FF)와 한자(U+4E00–9FFF), 끝에 문장부호 하나 */
  const JAPANESE_TEXT = /^[\u{3040}-\u{30ff}\u{4e00}-\u{9fff}]+[\u{3002}\u{ff01}\u{ff1f}!?]?$/u;
  const HAN = /[\u{4e00}-\u{9fff}]/u;
  /** 영어 단어 모양: Word, word, WORD (뒤에 숫자·문장부호 하나 허용) */
  const LATIN_WORD = /^(?:[A-Z][a-z]+|[a-z]+|[A-Z]+)[0-9]*[.,!?]?$/;

  function isLatinWord(word) {
    if (word.length < 2 || !LATIN_WORD.test(word)) return false;
    const letters = word.replace(/[^A-Za-z]/g, '');
    if (letters === letters.toUpperCase()) return true; // 약어·대문자 이름 (ROIROIMMD, MOMO22)
    return /[aeiou]/i.test(letters) && !/[^aeiouy]{4}/i.test(letters); // 모음이 있고 자음이 4개 이상 이어지지 않음
  }

  /**
   * 패딩 없는 짧은 덩어리의 결과가 자연스러운 글인지. 우연히 Base64 모양이 된 ID·코드는
   * 풀어도 깨진 글자 조합이 나오므로, 한 가지 문자 체계의 흔한 글자로만 된 결과만 받는다.
   * - 한글: 흔히 쓰는 음절로만 된 낱말 (안녕, 번역본)
   * - 일본어·한자: 가나와 흔히 쓰는 한자 (ヒカリ, 古い, 東京)
   * - 영어: 단어 모양의 낱말 (Hello!, Osanai, ROIROIMMD)
   */
  function looksNatural(text) {
    const t = text.trim();
    if (HANGUL_TEXT.test(t)) return [...t].every((c) => !/[가-힣]/.test(c) || common().hangul.has(c));
    if (JAPANESE_TEXT.test(t)) return [...t].every((c) => !HAN.test(c) || common().kanji.has(c));
    return t.split(' ').every(isLatinWord);
  }

  /** 디코딩 전 1차 필터: 길이, 패딩, 문자 종류. */
  function isCandidate(token, opts = AREA.body) {
    const { minLength, shortNeedsPadding = false, allowShort = true } = opts;
    if (token.length < minLength || token.length > MAX_TOKEN_LENGTH) return false;
    if (!allowShort && isShort(token)) return false;
    if (shortNeedsPadding && isBareShort(token) && !BARE_SHORT_LENGTHS.includes(token.length)) return false;

    const body = token.replace(/=+$/, '');
    if (body.length % 4 === 1) return false; // 유효한 Base64가 될 수 없는 길이
    if (/[+/]/.test(body) && /[-_]/.test(body)) return false; // 표준·URL-safe 문자가 섞임 (URL 경로 등)
    if (/^[0-9a-fA-F]+$/.test(body)) return false; // Hex 해시·코드

    const kinds = [/[A-Z]/, /[a-z]/, /[0-9]/].filter((re) => re.test(body)).length;
    return kinds >= 2; // 긴 영단어 제외
  }

  /**
   * 한 단계 디코딩. 정상적인 UTF-8 텍스트가 아니면 null.
   * 짧은 덩어리는 더 엄격하게 본다:
   * - 정규형: 풀린 바이트를 다시 Base64로 만들었을 때 똑같아야 한다. 실제 인코더는 `!`를 항상
   *   `IQ==`로 만들므로, 우연히 Base64 모양이 된 `Ia==` 같은 글자는 여기서 걸러진다.
   * - 의미 있는 결과: 글자나 숫자가 하나는 있어야 한다.
   * - 패딩이 없으면 결과가 자연스러운 글이어야 한다(looksNatural).
   */
  function tryDecode(token) {
    let s = token.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (s.length % 4 === 1) return null;
    s += '='.repeat((4 - (s.length % 4)) % 4);
    const short = isShort(token);
    let text;
    try {
      const binary = atob(s);
      if (short && btoa(binary) !== s) return null;
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      text = utf8.decode(bytes);
    } catch {
      return null;
    }
    if (text.trim() === '' || CONTROL_CHARS.test(text)) return null;
    if (short && !MEANINGFUL.test(text)) return null;
    if (isBareShort(token) && !looksNatural(text)) return null;
    return text;
  }

  /**
   * 여러 번 인코딩된 문장을 끝까지 푼다. 각 단계는 같은 영역 기준을 통과해야 한다.
   * @returns {{ text: string, depth: number } | null}
   */
  function decodeDeep(token, opts = AREA.body, maxDepth = MAX_DEPTH) {
    if (!isCandidate(token, opts)) return null;
    let text = tryDecode(token);
    if (text === null) return null;
    let depth = 1;
    while (depth < maxDepth) {
      const t = text.trim();
      if (!WHOLE_TOKEN.test(t) || !isCandidate(t, opts)) break;
      const next = tryDecode(t);
      if (next === null) break;
      text = next;
      depth++;
    }
    return { text, depth };
  }

  /**
   * 화면에 넣을 모양으로 다듬는다. `echo 이름 | base64`처럼 만든 글은 끝에 줄바꿈이 붙어 있어
   * 앞뒤 공백·줄바꿈을 걷어 낸다. 한 줄 영역(제목)은 안쪽 줄바꿈도 띄어쓰기로 바꾼다.
   */
  function tidy(text, opts = AREA.body) {
    const t = text.trim();
    return opts.singleLine ? t.replace(/\s*[\r\n]+\s*/g, ' ') : t;
  }

  /**
   * 텍스트 안의 Base64 구간을 모두 찾아 디코딩한다. 결과 글자는 tidy로 다듬은 것이다.
   * @returns {Array<{ start: number, end: number, original: string, text: string, depth: number }>}
   */
  function findMatches(text, opts = AREA.body) {
    const out = [];
    if (!text || text.length < opts.minLength) return out;
    CANDIDATE.lastIndex = 0;
    let m;
    while ((m = CANDIDATE.exec(text)) !== null) {
      const original = m[0];
      const decoded = decodeDeep(original, opts);
      if (decoded) {
        out.push({ start: m.index, end: m.index + original.length, original, text: tidy(decoded.text, opts), depth: decoded.depth });
      }
    }
    return out;
  }

  /** 링크로 만들어도 되는 http·https URL인지. */
  function isHttpUrl(text) {
    const t = text.trim();
    if (!/^https?:\/\/\S+$/i.test(t)) return false;
    try {
      const u = new URL(t);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  const base64 = { CANDIDATE, AREA, MAX_DEPTH, isShort, looksNatural, isCandidate, tryDecode, decodeDeep, tidy, findMatches, isHttpUrl };

  if (typeof module === 'object' && module.exports) module.exports = base64;
  else root.B64D = Object.assign(root.B64D || {}, { base64 });
})(globalThis);
