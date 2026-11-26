(function (root) {
  'use strict';

  const { api, settings } = root.B64D;
  const toggle = document.getElementById('enabled');
  const status = document.getElementById('status');

  const KONE = /^https:\/\/kone\.gg\//;

  function setStatus(text, strong) {
    status.textContent = '';
    status.append(text);
    if (strong !== undefined) {
      const b = document.createElement('strong');
      b.textContent = strong;
      status.append(b);
    }
  }

  async function refreshStatus(enabled) {
    if (!enabled) {
      setStatus('꺼져 있습니다. 페이지의 원문이 그대로 보입니다.');
      return;
    }
    const tab = await api.activeTab();
    if (!tab || !KONE.test(tab.url || '')) {
      setStatus('코네(kone.gg) 페이지에서만 동작합니다.');
      return;
    }
    try {
      const stats = await api.sendToTab(tab.id, { type: 'b64d:getStats' });
      setStatus('이 탭에서 디코딩한 문장: ', `${stats ? stats.count : 0}개`);
    } catch {
      // 확장을 설치·업데이트하기 전에 열린 탭에는 콘텐츠 스크립트가 없다.
      setStatus('페이지를 새로고침하면 동작합니다.');
    }
  }

  async function init() {
    const s = await settings.load();
    toggle.checked = s.enabled;
    toggle.addEventListener('change', async () => {
      const next = await settings.save({ enabled: toggle.checked });
      refreshStatus(next.enabled);
    });
    refreshStatus(s.enabled);
  }

  init();
})(globalThis);
