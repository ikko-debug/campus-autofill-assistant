(function () {
  "use strict";
  const C = globalThis.CampusAutofill;

  function adapter() {
    if (globalThis.CampusAutofillMoka?.detect()) return globalThis.CampusAutofillMoka;
    if (globalThis.CampusAutofillTencent?.detect()) return globalThis.CampusAutofillTencent;
    if (globalThis.CampusAutofillZhiye?.detect()) return globalThis.CampusAutofillZhiye;
    if (globalThis.CampusAutofillFeishu?.detect()) return globalThis.CampusAutofillFeishu;
    return null;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const current = adapter();
    if (message?.type === "CAMPUS_AUTOFILL_ANALYZE") {
      sendResponse(current ? current.analyze() : { supported: false, adapter: "未知网站", fields: 0 });
      return false;
    }

    if (message?.type === "CAMPUS_AUTOFILL_FILL") {
      (async () => {
        if (!current) throw new Error("当前页面暂不支持");
        const profile = await C.getProfile();
        if (!profile) throw new Error("尚未配置本地资料");
        const report = await current.fill(profile, { overwrite: Boolean(message.overwrite) });
        C.showToast(`已填写 ${report.filled.length} 项，待确认 ${report.missing.length} 项`, report.filled.length ? "success" : "info");
        sendResponse({ ok: true, report });
      })().catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    return false;
  });
})();
