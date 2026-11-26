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
      list.push({
        selector: selectors.postTitle,
        opts: { ...base64.AREA.title, minLength: s.minLength.title },
        display: { linkify: false }, // 제목은 텍스트로만
      });
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
    timer = 0;
    if (!current.enabled) return;
    withoutObserver(() => {
      replacer.reconcile();
      for (const area of areas(current)) {
        for (const el of document.querySelectorAll(area.selector)) {
          replacer.decorateArea(el, area.opts, area.display, selectors.skip);
        }
      }
    });
    document.documentElement.dataset.b64dCount = String(replacer.countAll());
  }

  function schedule() {
    if (timer) clearTimeout(timer);
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
      return { enabled: current.enabled, count: current.enabled ? replacer.countAll() : 0 };
    }
    return undefined;
  });

  replacer.installClickHandler();
  observer = new MutationObserver(schedule);

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
