(function (root) {
  'use strict';

  const { api, settings } = root.B64D;
  const enabled = document.getElementById('enabled');
  const enabledDesc = document.getElementById('enabled-desc');
  const options = document.getElementById('options');
  /** 켜기·끄기 옵션: data-key가 설정 이름 */
  const switches = [...document.querySelectorAll('input[data-key]')];
  const colors = [...document.querySelectorAll('input[name="color"]')];

  const DESC_ON = '코네의 Base64 문장을 자동으로 풀어 줍니다';
  const DESC_OFF = '꺼져 있습니다. 원문이 그대로 보입니다';

  function render(s) {
    enabled.checked = s.enabled;
    enabledDesc.textContent = s.enabled ? DESC_ON : DESC_OFF;
    options.disabled = !s.enabled; // 꺼져 있으면 나머지 옵션은 흐리게 막는다
    for (const input of switches) input.checked = s[input.dataset.key];
    for (const input of colors) input.checked = input.value === s.color;
  }

  async function update(patch) {
    render(await settings.save(patch));
  }

  async function init() {
    try {
      document.getElementById('version').textContent = `v${api.version()}`;
    } catch {
      // 버전을 못 읽어도 팝업은 동작해야 한다
    }
    render(await settings.load());
    enabled.addEventListener('change', () => update({ enabled: enabled.checked }));
    for (const input of switches) {
      input.addEventListener('change', () => update({ [input.dataset.key]: input.checked }));
    }
    for (const input of colors) {
      input.addEventListener('change', () => {
        if (input.checked) update({ color: input.value });
      });
    }
  }

  init();
})(globalThis);
