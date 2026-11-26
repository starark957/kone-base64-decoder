// 코네 화면 구조에 의존하는 선택자. 코네가 구조를 바꾸면 이 파일만 고친다.
// 2026-11-26 확인 기준.
(function (root) {
  'use strict';

  const selectors = Object.freeze({
    /** 게시물 본문 (읽기 전용 tiptap 렌더링) */
    postBody: '#post-article .article-prose',
    /** 게시물 제목 (링크 아님) */
    postTitle: '#post-article header h1',
    /** 게시판 목록 행: 행 전체가 <a>, 안쪽 div[title]에 전체 제목이 있다. 정확한 제목 span 선택은 M4에서 확정 */
    listRow: 'a div[title]',
    /** 처리하지 않을 요소 */
    skip: 'script, style, noscript, textarea, input, [contenteditable="true"]',
  });

  root.B64D = Object.assign(root.B64D || {}, { selectors });
})(globalThis);
