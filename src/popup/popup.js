(function (root) {
  'use strict';

  const { api, settings } = root.B64D;
  const inputs = [...document.querySelectorAll('input[data-setting]')];
  const options = document.getElementById('options');
  const enabledDesc = document.getElementById('enabled-desc');

  const DESC_ON = '코네의 Base64 문장을 자동으로 풀어 줍니다';
  const DESC_OFF = '꺼져 있습니다. 원문이 그대로 보입니다';

  function render(s) {
    for (const input of inputs) input.checked = !!s[input.dataset.setting];
    enabledDesc.textContent = s.enabled ? DESC_ON : DESC_OFF;
    // 전체가 꺼져 있으면 세부 설정은 흐리게(바꿀 수는 있게) 둔다
    options.classList.toggle('dimmed', !s.enabled);
  }

  async function init() {
    try {
      document.getElementById('version').textContent = `v${api.version()}`;
    } catch {
      // 버전을 못 읽어도 팝업은 동작해야 한다
    }
    render(await settings.load());
    for (const input of inputs) {
      input.addEventListener('change', async () => {
        render(await settings.save({ [input.dataset.setting]: input.checked }));
      });
    }
  }

  init();
})(globalThis);
