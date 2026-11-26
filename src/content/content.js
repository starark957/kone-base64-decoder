// 코네 페이지에 주입되는 콘텐츠 스크립트.
// 설정을 읽어 게시물 본문·제목을 디코딩하고, 화면이 다시 그려지면 재처리한다.
(function (root) {
  'use strict';

  const { settings, selectors, base64, replacer } = root.B64D;

  /** 처리가 무거울 때(긴 글 등) 다음 처리까지 기다리는 시간 */
  const THROTTLE_MS = 200;
  /** 마지막 처리가 이보다 빨랐으면 기다리지 않고 바로 처리한다(화면에 원문이 한 번도 안 보이게) */
  const CHEAP_SCAN_MS = 8;

  let current = settings.normalize(undefined);
  let observer = null;
  let timer = 0;

  /**
   * 처리할 영역 목록. 본문은 풀린 주소를 링크로 만들고,
   * 제목은 텍스트로만 바꾼다(목록 제목은 링크 안이라 클릭 전환 없이 원문 툴팁만 붙는다).
   */
  const AREAS = Object.freeze([
    { selector: selectors.postBody, opts: base64.AREA.body, display: { linkify: true } },
    { selector: selectors.postTitle, opts: base64.AREA.title, display: { linkify: false } },
    { selector: selectors.listTitle, opts: base64.AREA.title, display: { linkify: false } },
  ]);
  const AREA_UNION = AREAS.map((a) => a.selector).join(', ');

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
      for (const area of AREAS) {
        for (const el of document.querySelectorAll(area.selector)) {
          replacer.decorateArea(el, area.opts, area.display, selectors.skip);
        }
      }
    });
    document.documentElement.dataset.b64dCount = String(replacer.countAll());
    debug.scans++;
    debug.lastScanMs = performance.now() - t0;
  }

  /** 테스트용 계측값 (처리 횟수, 마지막 처리 시간) */
  const debug = { scans: 0, lastScanMs: 0 };
  root.B64D.debug = debug;

  /** 바뀐 곳이 처리 대상 영역과 관련 있는지. 시계·조회수 같은 다른 곳의 변경은 무시한다. */
  function isRelevant(records) {
    const union = AREA_UNION;
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
   * 관련 변경이 생기면 처리한다.
   * - 처리가 가벼우면(지난번 CHEAP_SCAN_MS 미만) 바로 처리한다. 화면 감시 콜백은 브라우저가
   *   화면을 그리기 전에 실행되므로, 글 이동·뒤로·앞으로 가기에서 원문이 깜빡 보이지 않는다.
   * - 무거우면 THROTTLE_MS 뒤에 한 번 처리한다. 이미 예약돼 있으면 미루지 않는다
   *   (변경이 계속 이어져도 처리가 무한히 밀리지 않게).
   */
  function onMutations(records) {
    if (!current.enabled || timer || !isRelevant(records)) return;
    if (debug.lastScanMs < CHEAP_SCAN_MS) scan();
    else timer = setTimeout(scan, THROTTLE_MS);
  }

  function applySettings(next) {
    current = next;
    document.documentElement.dataset.b64d = next.enabled ? 'on' : 'off';
    // 꺼지면 원문으로 되돌리고, 켜지면 처음부터 다시 처리한다.
    withoutObserver(() => replacer.restoreAll());
    scan();
  }

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
