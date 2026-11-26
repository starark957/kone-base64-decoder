(function (root) {
  'use strict';

  const { api, settings } = root.B64D;
  const toggle = document.getElementById('enabled');
  const status = document.getElementById('status');
  const breakdown = document.getElementById('breakdown');

  const KONE = /^https:\/\/kone\.gg\//;
  /** 팝업이 열려 있는 동안 개수를 다시 묻는 간격(게시물 이동·켜기 직후 처리 결과를 따라가게) */
  const REFRESH_MS = 1000;

  let enabled = true;

  function setStatus(text, strong) {
    status.textContent = '';
    status.append(text);
    if (strong !== undefined) {
      const b = document.createElement('strong');
      b.textContent = strong;
      status.append(b);
    }
  }

  function setBreakdown(stats) {
    if (!stats) {
      breakdown.hidden = true;
      return;
    }
    for (const key of ['body', 'title', 'list']) {
      breakdown.querySelector(`[data-key="${key}"]`).textContent = String(stats[key] || 0);
    }
    breakdown.hidden = false;
  }

  async function refreshStatus() {
    if (!enabled) {
      setStatus('꺼져 있습니다. 페이지의 원문이 그대로 보입니다.');
      setBreakdown(null);
      return;
    }
    // tabs 권한이 없으면 탭 주소(tab.url)가 비어 있다. 그래서 주소로 먼저 거르지 않고
    // 콘텐츠 스크립트에 바로 물어본다(코네 탭에만 주입되므로 대답이 오면 코네 탭이다).
    const tab = await api.activeTab();
    let stats = null;
    if (tab && tab.id !== undefined) {
      try {
        stats = await api.sendToTab(tab.id, { type: 'b64d:getStats' });
      } catch {
        stats = null; // 콘텐츠 스크립트 없음
      }
    }
    if (stats) {
      setStatus('이 화면에서 디코딩한 문장: ', `${stats.count}개`);
      setBreakdown(stats);
      return;
    }
    setBreakdown(null);
    if (tab && tab.url && !KONE.test(tab.url)) {
      setStatus('코네(kone.gg) 페이지에서만 동작합니다.');
    } else if (tab && tab.url) {
      // 확장을 설치·업데이트하기 전에 열린 코네 탭에는 콘텐츠 스크립트가 없다.
      setStatus('페이지를 새로고침하면 동작합니다.');
    } else {
      setStatus('코네(kone.gg) 페이지에서만 동작합니다. 코네 페이지라면 새로고침해 주세요.');
    }
  }

  async function init() {
    const s = await settings.load();
    enabled = s.enabled;
    toggle.checked = enabled;
    toggle.addEventListener('change', async () => {
      const next = await settings.save({ enabled: toggle.checked });
      enabled = next.enabled;
      refreshStatus();
    });
    await refreshStatus();
    setInterval(refreshStatus, REFRESH_MS);
  }

  init();
})(globalThis);
