// 코네 페이지에 주입되는 콘텐츠 스크립트.
// 설정을 읽어 게시물 본문·제목을 디코딩하고, 화면이 다시 그려지면 재처리한다.
(function (root) {
  'use strict';

  const { api, settings, selectors, base64, replacer } = root.B64D;

  const DEBOUNCE_MS = 200;

  let current = settings.normalize(undefined);
  let observer = null;
  let timer = 0;

  /** 지금 설정에서 처리할 영역 목록 */
  function areas(s) {
    const list = [
      {
        selector: selectors.postBody,
        opts: { ...base64.AREA.body, minLength: s.minLength.body },
        display: { linkify: s.linkify },
      },
    ];
    if (s.decodeTitles) {
      const titleOpts = { ...base64.AREA.title, minLength: s.minLength.title };
      // 제목은 텍스트로만. 목록 제목은 링크 안이라 클릭 전환 없이 원문 툴팁만 붙는다.
      list.push({ selector: selectors.postTitle, opts: titleOpts, display: { linkify: false } });
      list.push({ selector: selectors.listTitle, opts: titleOpts, display: { linkify: false } });
    }
    return list;
  }

  /** 확장이 DOM을 바꾸는 동안에는 감시를 멈춰 자기 변경에 다시 반응하지 않게 한다. */
  function withoutObserver(fn) {
    if (observer) observer.disconnect();
    try {
      fn();
    } finally {
      if (observer) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }

  function scan() {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (!current.enabled) return;
    const t0 = performance.now();
    withoutObserver(() => {
      replacer.reconcile();
      for (const area of areas(current)) {
        for (const el of document.querySelectorAll(area.selector)) {
          replacer.decorateArea(el, area.opts, area.display, selectors.skip);
        }
      }
    });
    document.documentElement.dataset.b64dCount = String(replacer.countAll());
    debug.scans++;
    debug.lastScanMs = performance.now() - t0;
  }

  /**
   * 팝업에 보여줄 영역별 디코딩 개수. 화면에 보이는 것만 센다
   * (목록 행에는 데스크톱·모바일 레이아웃이 함께 있어 둘 중 하나는 숨겨져 있다).
   */
  function stats() {
    const out = { count: 0, body: 0, title: 0, list: 0 };
    for (const el of document.querySelectorAll('.b64d')) {
      if (el.getClientRects().length === 0) continue;
      if (el.closest(selectors.postBody)) out.body++;
      else if (el.closest(selectors.postTitle)) out.title++;
      else if (el.closest(selectors.listTitle)) out.list++;
      else continue;
      out.count++;
    }
    return out;
  }

  /** 테스트용 계측값 (처리 횟수, 마지막 처리 시간) */
  const debug = { scans: 0, lastScanMs: 0 };
  root.B64D.debug = debug;

  /** 처리 대상 영역 전체를 한 번에 고르는 선택자 */
  function areaUnion() {
    return areas(current).map((a) => a.selector).join(', ');
  }

  /** 바뀐 곳이 처리 대상 영역과 관련 있는지. 시계·조회수 같은 다른 곳의 변경은 무시한다. */
  function isRelevant(records) {
    const union = areaUnion();
    for (const r of records) {
      const el = r.target.nodeType === Node.ELEMENT_NODE ? r.target : r.target.parentElement;
      if (!el) continue;
      if (el.closest(union)) return true;
      if (r.type === 'childList') {
        for (const n of r.addedNodes) {
          if (n.nodeType === Node.ELEMENT_NODE && (n.matches(union) || n.querySelector(union))) return true;
        }
      }
    }
    return false;
  }

  /**
   * 관련 변경이 생기면 DEBOUNCE_MS 뒤에 한 번 처리한다.
   * 이미 예약돼 있으면 미루지 않는다(변경이 계속 이어져도 처리가 무한히 밀리지 않게).
   */
  function onMutations(records) {
    if (!current.enabled || timer || !isRelevant(records)) return;
    timer = setTimeout(scan, DEBOUNCE_MS);
  }

  function applySettings(next) {
    current = next;
    document.documentElement.dataset.b64d = next.enabled ? 'on' : 'off';
    // 표시 방식·영역이 바뀌었을 수 있으니 되돌린 뒤 새 설정으로 다시 처리한다.
    withoutObserver(() => replacer.restoreAll());
    scan();
  }

  api.onMessage((message) => {
    if (message && message.type === 'b64d:getStats') {
      return { enabled: current.enabled, ...(current.enabled ? stats() : { count: 0, body: 0, title: 0, list: 0 }) };
    }
    return undefined;
  });

  replacer.installClickHandler();
  observer = new MutationObserver(onMutations);

  function start() {
    settings.load().then((s) => {
      applySettings(s);
      settings.onChange(applySettings);
    });
  }

  // 페이지 프레임워크(SvelteKit)의 하이드레이션이 끝난 뒤 시작한다.
  if (document.readyState === 'complete') start();
  else root.addEventListener('load', start, { once: true });
})(globalThis);
