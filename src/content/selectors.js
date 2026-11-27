// 코네 화면 구조에 의존하는 선택자. 코네가 구조를 바꾸면 이 파일만 고친다.
// 2026-11-26 확인 기준.
(function (root) {
  'use strict';

  const selectors = Object.freeze({
    /** 게시물 본문 (읽기 전용 tiptap 렌더링) */
    postBody: '#post-article .article-prose',
    /** 게시물 제목 (링크 아님) */
    postTitle: '#post-article header h1',
    /**
     * 글 목록 제목.
     * - 게시판·검색 목록: 행 전체가 <a>이고 한 행에 데스크톱·모바일 레이아웃이 함께 있다.
     *   같은 클래스의 span이 작성자 칸에도 쓰이므로 위치로 고른다.
     * - 홈 화면의 서브별 미리보기 목록: <a> 바로 아래 한 줄짜리 제목 span (2026-11-27 확인)
     * - 프로필의 게시글 탭: 두 줄짜리 굵은 제목 span. 댓글 탭의 글 제목(font-medium)은 고르지 않는다.
     */
    listTitle: [
      'a[href*="/s/"] div[title] > div.min-w-0 > div.flex > span.text-ellipsis',
      'a[href*="/s/"] .md\\:hidden div.flex-col > div.flex.overflow-hidden > span.text-ellipsis',
      'a[href*="/s/"] > span.line-clamp-1',
      'a[href*="/s/"] span.line-clamp-2.font-semibold',
    ].join(', '),
    /** 처리하지 않을 요소 */
    skip: 'script, style, noscript, textarea, input, [contenteditable="true"]',
  });

  root.B64D = Object.assign(root.B64D || {}, { selectors });
})(globalThis);
