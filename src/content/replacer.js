// DOM 치환·복원. 디코딩 결과는 항상 textContent로만 넣는다(HTML로 해석하지 않음).
(function (root) {
  'use strict';

  const { base64 } = root.B64D;

  const CLS = 'b64d';
  const SKIP_INSIDE = `.${CLS}`;

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
    let t = `원문: ${m.original}`;
    if (m.depth > 1) t += ` · ${m.depth}단계 디코딩`;
    if (clickable) t += ' · 클릭하면 원문/결과 전환';
    return t;
  }

  /**
   * 디코딩 결과 요소를 만든다.
   * - 링크 결과(본문, linkify): <a> + 숨긴 원문 + ↺ 버튼
   * - 텍스트 결과: 클릭으로 원문/결과 전환. 링크 안에 있으면 클릭 전환 없이 툴팁만.
   */
  function makeDecoded(m, { linkify, inLink }) {
    const span = document.createElement('span');
    span.className = CLS;
    span.dataset.b64dOriginal = m.original;
    span.dataset.b64dDecoded = m.text;
    span.dataset.b64dDepth = String(m.depth);
    span.dataset.b64dShowing = 'decoded';
    if (/[\r\n]/.test(m.text)) span.classList.add(`${CLS}-multiline`);

    if (linkify && !inLink && base64.isHttpUrl(m.text)) {
      span.classList.add(`${CLS}-link`);
      span.title = tooltip(m, false);

      const a = document.createElement('a');
      a.className = `${CLS}-url`;
      a.href = m.text.trim();
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = m.text.trim();

      const raw = document.createElement('span');
      raw.className = `${CLS}-raw`;
      raw.hidden = true;
      raw.textContent = m.original;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `${CLS}-toggle`;
      btn.title = '원문 보기';
      btn.setAttribute('aria-label', '원문 보기');
      btn.textContent = '↺';

      span.append(a, raw, btn);
      return span;
    }

    const clickable = !inLink;
    if (clickable) span.dataset.b64dClickable = '';
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
    const matches = base64.findMatches(node.data, opts);
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
    for (const el of scope.querySelectorAll(`.${CLS}`)) {
      el.replaceWith(document.createTextNode(el.dataset.b64dOriginal || ''));
    }
    tracked.clear();
    checked = new WeakMap(); // 설정(최소 길이 등)이 바뀌었을 수 있으니 처음부터 다시 검사
  }

  function countAll(scope = document) {
    return scope.querySelectorAll(`.${CLS}`).length;
  }

  function setShowing(span, showing) {
    span.dataset.b64dShowing = showing;
    if (span.classList.contains(`${CLS}-link`)) {
      span.querySelector(`.${CLS}-url`).hidden = showing === 'original';
      span.querySelector(`.${CLS}-raw`).hidden = showing !== 'original';
      const label = showing === 'original' ? '결과 보기' : '원문 보기';
      const btn = span.querySelector(`.${CLS}-toggle`);
      btn.title = label;
      btn.setAttribute('aria-label', label);
    } else {
      span.textContent = showing === 'original' ? span.dataset.b64dOriginal : span.dataset.b64dDecoded;
    }
  }

  /** 문서 전체에 한 번만 다는 클릭 처리(원문/결과 전환). */
  function installClickHandler(doc = document) {
    doc.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const btn = target.closest(`.${CLS}-toggle`);
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const span = btn.closest(`.${CLS}`);
        setShowing(span, span.dataset.b64dShowing === 'original' ? 'decoded' : 'original');
        return;
      }

      const span = target.closest(`.${CLS}[data-b64d-clickable]`);
      if (!span) return;
      const sel = doc.getSelection && doc.getSelection();
      if (sel && !sel.isCollapsed) return; // 글자를 드래그해 고르는 중이면 전환하지 않는다
      setShowing(span, span.dataset.b64dShowing === 'original' ? 'decoded' : 'original');
    });
  }

  const replacer = { decorateArea, decorateTextNode, reconcile, restoreAll, countAll, installClickHandler };
  root.B64D = Object.assign(root.B64D || {}, { replacer });
})(globalThis);
