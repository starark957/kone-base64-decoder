// Base64 감지·디코딩 순수 함수. DOM과 브라우저 API에 의존하지 않는다(단위 테스트 대상).
// 후보는 넓게 찾고, "디코딩했을 때 정상적인 UTF-8 문장이 나오는가"로 엄격하게 거른다.
(function (root) {
  'use strict';

  /**
   * 앞뒤가 Base64 문자가 아닌 덩어리. `Qw==`처럼 패딩 앞이 2자뿐인 경우도 잡도록 본체는 2자부터 받고,
   * 패딩을 포함한 전체 길이 기준(영역별 최소 길이)은 isCandidate에서 본다.
   */
  const CANDIDATE = /(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/_-]{2,}={0,2}(?![A-Za-z0-9+/=_-])/g;

  /** 영역별 기준 */
  const AREA = Object.freeze({
    body: Object.freeze({ minLength: 16, shortNeedsPadding: false }),
    title: Object.freeze({ minLength: 4, shortNeedsPadding: true, singleLine: true }),
  });

  const MAX_DEPTH = 10;
  /** 이보다 긴 덩어리는 이미지 등 바이너리일 가능성이 높아 시도하지 않는다. */
  const MAX_TOKEN_LENGTH = 100000;
  /** 패딩이 없어도 되는 길이 (제목 영역) */
  const PADDING_FREE_LENGTH = 16;

  const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
  const WHOLE_TOKEN = /^[A-Za-z0-9+/_-]+={0,2}$/;

  const utf8 = new TextDecoder('utf-8', { fatal: true });

  /** 디코딩 전 1차 필터: 길이, 패딩, 문자 종류. */
  function isCandidate(token, opts = AREA.body) {
    const { minLength, shortNeedsPadding = false } = opts;
    if (token.length < minLength || token.length > MAX_TOKEN_LENGTH) return false;
    if (shortNeedsPadding && token.length < PADDING_FREE_LENGTH && !token.endsWith('=')) return false;

    const body = token.replace(/=+$/, '');
    if (body.length % 4 === 1) return false; // 유효한 Base64가 될 수 없는 길이
    if (/[+/]/.test(body) && /[-_]/.test(body)) return false; // 표준·URL-safe 문자가 섞임 (URL 경로 등)
    if (/^[0-9a-fA-F]+$/.test(body)) return false; // Hex 해시·코드

    const kinds = [/[A-Z]/, /[a-z]/, /[0-9]/].filter((re) => re.test(body)).length;
    return kinds >= 2; // 긴 영단어 제외
  }

  /** 한 단계 디코딩. 정상적인 UTF-8 텍스트가 아니면 null. */
  function tryDecode(token) {
    let s = token.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (s.length % 4 === 1) return null;
    s += '='.repeat((4 - (s.length % 4)) % 4);
    let text;
    try {
      const binary = atob(s);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      text = utf8.decode(bytes);
    } catch {
      return null;
    }
    if (text.trim() === '' || CONTROL_CHARS.test(text)) return null;
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

  const base64 = { CANDIDATE, AREA, MAX_DEPTH, isCandidate, tryDecode, decodeDeep, tidy, findMatches, isHttpUrl };

  if (typeof module === 'object' && module.exports) module.exports = base64;
  else root.B64D = Object.assign(root.B64D || {}, { base64 });
})(globalThis);
