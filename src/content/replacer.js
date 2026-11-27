// DOM 치환·복원. 디코딩 결과는 항상 textContent로만 넣는다(HTML로 해석하지 않음).
(function (root) {
  'use strict';

  const { base64 } = root.B64D;

  const CLS = 'b64d';
  const SKIP_INSIDE = `.${CLS}`;
  const CODE_INSIDE = 'code, pre, kbd, samp';

  /**
   * 치환한 원래 텍스트 노드(앞부분으로 남김) → { prefix, parts }.
   * 프레임워크가 그 노드의 내용만 바꾸면(prefix와 달라지면) 확장이 붙인 뒷부분(parts)이
   * 예전 내용으로 남으므로, 다음 처리 때 걷어내고 다시 처리한다.
   */
  const tracked = new Map();

  /**
   * 이미 검사한 텍스트 노드 → 검사할 때의 내용. 내용이 그대로면 다시 검사하지 않는다
   * (화면이 조금 바뀔 때마다 긴 본문 전체에 정규식을 다시 돌리지 않게).
   */
  let checked = new WeakMap();

  /** 처리해도 되는 텍스트 노드만 모은다. */
  function collectTextNodes(scope, skipSelector) {
    const out = [];
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (checked.get(node) === node.data) return NodeFilter.FILTER_REJECT;
        if (!node.data || node.data.trim().length < 2) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(SKIP_INSIDE) || parent.closest(skipSelector)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function tooltip(m, clickable) {
    if (clickable) return '클릭하면 Base64 원문 보기';
    let t = `원문: ${m.original}`;
    if (m.depth > 1) t += ` · ${m.depth}단계 디코딩`;
    return t;
  }

  function depthNote(span) {
    const depth = Number(span.dataset.b64dDepth);
    return depth > 1 ? ` · ${depth}단계 디코딩` : '';
  }

  /** 아이콘(선 24×24). 고정된 경로만 쓰고 페이지 내용은 넣지 않는다. */
  const ICON_PATHS = {
    link: [
      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
      'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    ],
    code: ['M8 7l-5 5 5 5', 'M16 7l5 5-5 5'],
    copy: [
      'M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z',
      'M5 15H4a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v1',
    ],
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    revert: ['M3 12a9 9 0 1 0 3-6.7', 'M3 3v6h6'],
  };
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', `${CLS}-ico`);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of ICON_PATHS[name]) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, iconName) {
    const btn = el('button', `${CLS}-btn ${className}`);
    btn.type = 'button';
    btn.append(icon(iconName));
    return btn;
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  /**
   * 주소로 풀린 결과: 한 줄을 따로 차지하는 카드.
   * [링크 표시] 주소·도메인 [복사][원문/결과 전환]
   */
  function makeLinkCard(span, m) {
    const url = m.text.trim();
    span.classList.add(`${CLS}-card`);
    span.dataset.b64dHost = hostOf(url);

    const badge = el('span', `${CLS}-badge`);
    badge.append(icon('link'));

    const body = el('span', `${CLS}-body`);
    const a = el('a', `${CLS}-url`, url);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = url;
    const raw = el('span', `${CLS}-raw`, m.original);
    raw.hidden = true;
    raw.title = m.original;
    body.append(a, raw, el('span', `${CLS}-sub`));

    span.append(badge, body, button(`${CLS}-copy`, 'copy'), button(`${CLS}-toggle`, 'revert'));
    renderCard(span);
    return span;
  }

  /** 카드의 원문/결과 표시에 맞춰 아이콘·보조 문구·버튼 이름을 맞춘다. */
  function renderCard(span) {
    const original = span.dataset.b64dShowing === 'original';
    span.querySelector(`.${CLS}-url`).hidden = original;
    span.querySelector(`.${CLS}-raw`).hidden = !original;
    span.querySelector(`.${CLS}-badge`).replaceChildren(icon(original ? 'code' : 'link'));

    span.querySelector(`.${CLS}-sub`).textContent = original ? `Base64 원문${depthNote(span)}` : span.dataset.b64dHost;

    const labels = [
      [`.${CLS}-copy`, original ? '원문 복사' : '주소 복사'],
      [`.${CLS}-toggle`, original ? '결과 보기' : '원문 보기'],
    ];
    for (const [sel, label] of labels) {
      const btn = span.querySelector(sel);
      btn.title = label;
      btn.setAttribute('aria-label', label);
    }
  }

  /**
   * 디코딩 결과 요소를 만든다.
   * - 주소 결과(본문, linkify): 카드
   * - 텍스트 결과: 클릭으로 원문/결과 전환. 링크 안에 있으면 클릭 전환 없이 툴팁만.
   */
  function makeDecoded(m, { linkify, inLink }) {
    const span = document.createElement('span');
    span.className = CLS;
    span.dataset.b64dOriginal = m.original;
    span.dataset.b64dDecoded = m.text;
    span.dataset.b64dDepth = String(m.depth);
    span.dataset.b64dShowing = 'decoded';

    if (linkify && !inLink && base64.isHttpUrl(m.text)) return makeLinkCard(span, m);

    span.classList.add(`${CLS}-text`);
    if (/[\r\n]/.test(m.text)) span.classList.add(`${CLS}-multiline`);

    const clickable = !inLink;
    if (clickable) {
      span.dataset.b64dClickable = '';
      span.setAttribute('aria-haspopup', 'dialog');
      span.setAttribute('aria-expanded', 'false');
    }
    span.title = tooltip(m, clickable);
    span.textContent = m.text;
    return span;
  }

  /**
   * 텍스트 노드 하나를 치환한다. 원래 노드는 앞부분으로 남겨 두어(splitText)
   * 페이지 프레임워크가 들고 있는 참조가 끊기지 않게 한다.
   * @returns {number} 치환한 개수
   */
  function decorateTextNode(node, opts, display) {
    let matches = base64.findMatches(node.data, opts);
    // 코드 블록 안의 `abc=` 같은 짧은 덩어리는 코드일 가능성이 높아 그대로 둔다(긴 것은 푼다).
    if (matches.length > 0 && node.parentElement.closest(CODE_INSIDE)) {
      matches = matches.filter((m) => !base64.isShort(m.original));
    }
    if (matches.length === 0) {
      checked.set(node, node.data);
      return 0;
    }
    const inLink = !!node.parentElement.closest('a');
    const parts = [];
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      if (m.end < node.length) {
        const tail = node.splitText(m.end);
        checked.set(tail, tail.data);
        parts.push(tail);
      }
      const mid = node.splitText(m.start);
      const decorated = makeDecoded(m, { linkify: display.linkify, inLink });
      mid.replaceWith(decorated);
      parts.push(decorated);
    }
    checked.set(node, node.data);
    tracked.set(node, { prefix: node.data, parts });
    return matches.length;
  }

  /** 프레임워크가 내용을 바꾼 원래 노드의 예전 뒷부분을 걷어낸다. 걷어낸 개수를 돌려준다. */
  function reconcile() {
    if (pop && !pop.anchor.isConnected) closePopover(); // 화면이 바뀌어 원래 글자가 사라졌으면 닫는다
    let removed = 0;
    for (const [node, rec] of tracked) {
      if (!node.isConnected) {
        tracked.delete(node);
      } else if (node.data !== rec.prefix) {
        for (const part of rec.parts) {
          if (part.isConnected) {
            part.remove();
            removed++;
          }
        }
        tracked.delete(node);
      }
    }
    return removed;
  }

  /** 한 영역(요소) 안을 모두 처리한다. */
  function decorateArea(scope, opts, display, skipSelector) {
    let count = 0;
    for (const node of collectTextNodes(scope, skipSelector)) {
      count += decorateTextNode(node, opts, display);
    }
    return count;
  }

  /** 치환한 요소를 모두 원문 텍스트로 되돌린다. */
  function restoreAll(scope = document) {
    closePopover();
    for (const el of scope.querySelectorAll(`.${CLS}`)) {
      el.replaceWith(document.createTextNode(el.dataset.b64dOriginal || ''));
    }
    tracked.clear();
    checked = new WeakMap(); // 설정(최소 길이 등)이 바뀌었을 수 있으니 처음부터 다시 검사
  }

  function countAll(scope = document) {
    return scope.querySelectorAll(`.${CLS}`).length;
  }

  const FADE_MS = 180;

  /** 카드의 전환 버튼: 아이콘을 한 바퀴 돌리고, 내용을 잠깐 흐리게 했다가 바꾼다. */
  function toggleCard(btn) {
    const span = btn.closest(`.${CLS}-card`);
    btn.classList.remove('is-spinning');
    void btn.offsetWidth; // 연속으로 눌러도 매번 다시 돌게
    btn.classList.add('is-spinning');
    const body = span.querySelector(`.${CLS}-body`);
    body.classList.add('is-fading');
    setTimeout(() => {
      span.dataset.b64dShowing = span.dataset.b64dShowing === 'original' ? 'decoded' : 'original';
      renderCard(span);
      body.classList.remove('is-fading');
    }, FADE_MS);
  }

  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 클립보드 API를 못 쓰는 환경이면 예전 방식으로 복사한다
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  /** 복사 버튼: text를 복사하고 잠깐 체크 표시를 띄운다. */
  async function copyWithFeedback(btn, text) {
    if (!(await writeClipboard(text))) return;
    btn.replaceChildren(icon('check'));
    btn.classList.add('is-done');
    clearTimeout(btn._b64dTimer);
    btn._b64dTimer = setTimeout(() => {
      btn.replaceChildren(icon('copy'));
      btn.classList.remove('is-done');
    }, 1200);
  }

  /** 카드의 복사 버튼: 지금 보이는 쪽(주소 또는 원문)을 복사한다. */
  function copyCard(btn) {
    const span = btn.closest(`.${CLS}-card`);
    const original = span.dataset.b64dShowing === 'original';
    copyWithFeedback(btn, original ? span.dataset.b64dOriginal : span.dataset.b64dDecoded.trim());
  }

  /**
   * 글자 결과의 원문 말풍선. 글자 자체를 원문으로 바꾸면 길이가 달라져 주변 글이 밀리므로,
   * 원문은 글자 아래(자리가 없으면 위)에 띄운다. 한 번에 하나만 열린다.
   * 말풍선은 처리 대상 영역 밖(body 끝)에 붙여서 화면 감시에 걸리지 않게 한다.
   */
  let pop = null; // { el, anchor }

  function openPopover(anchor) {
    closePopover();
    const box = el('div', `${CLS}-pop`);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Base64 원문');

    const text = el('div', `${CLS}-pop-text`);
    text.append(
      el('span', `${CLS}-pop-label`, `Base64 원문${depthNote(anchor)}`),
      el('span', `${CLS}-pop-raw`, anchor.dataset.b64dOriginal),
    );
    const copy = button(`${CLS}-pop-copy`, 'copy');
    copy.title = '원문 복사';
    copy.setAttribute('aria-label', '원문 복사');
    box.append(text, copy);

    document.body.append(box);
    pop = { el: box, anchor };
    anchor.classList.add('is-open');
    anchor.setAttribute('aria-expanded', 'true');
    placePopover();
  }

  function closePopover() {
    if (!pop) return;
    pop.el.remove();
    pop.anchor.classList.remove('is-open');
    pop.anchor.setAttribute('aria-expanded', 'false');
    pop = null;
  }

  function placePopover() {
    if (!pop) return;
    const GAP = 6;
    const MARGIN = 8;
    // 여러 줄로 나뉜 글자면 처음 눌린 줄이 아니라 첫 줄을 기준으로 한다
    const r = pop.anchor.getClientRects()[0] || pop.anchor.getBoundingClientRect();
    const w = pop.el.offsetWidth;
    const h = pop.el.offsetHeight;
    const left = Math.max(MARGIN, Math.min(r.left, innerWidth - w - MARGIN));
    const below = r.bottom + GAP;
    const top = below + h > innerHeight - MARGIN && r.top - GAP - h > MARGIN ? r.top - GAP - h : below;
    pop.el.style.left = `${left + scrollX}px`;
    pop.el.style.top = `${top + scrollY}px`;
  }

  /** 문서 전체에 한 번만 다는 처리(원문 보기, 복사, 말풍선 닫기). */
  function installClickHandler(doc = document) {
    doc.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const btn = target.closest(`.${CLS}-card .${CLS}-btn`);
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        if (btn.classList.contains(`${CLS}-toggle`)) toggleCard(btn);
        else copyCard(btn);
        return;
      }

      if (pop && pop.el.contains(target)) {
        const copy = target.closest(`.${CLS}-pop-copy`);
        if (copy) {
          e.preventDefault();
          copyWithFeedback(copy, pop.anchor.dataset.b64dOriginal);
        }
        return; // 말풍선 안을 누른 것(글자 고르기 등)은 닫지 않는다
      }

      const span = target.closest(`.${CLS}[data-b64d-clickable]`);
      if (!span) {
        closePopover();
        return;
      }
      const sel = doc.getSelection && doc.getSelection();
      if (sel && !sel.isCollapsed) return; // 글자를 드래그해 고르는 중이면 열지 않는다
      if (pop && pop.anchor === span) closePopover();
      else openPopover(span);
    });

    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePopover();
    });
    root.addEventListener('resize', placePopover);
  }

  const replacer = { decorateArea, decorateTextNode, reconcile, restoreAll, countAll, installClickHandler };
  root.B64D = Object.assign(root.B64D || {}, { replacer });
})(globalThis);
