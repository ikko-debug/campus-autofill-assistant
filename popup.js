const statusEl = document.getElementById("site-status");
const summaryEl = document.getElementById("page-summary");
const resultEl = document.getElementById("result");
const fillButton = document.getElementById("fill");

async function currentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function send(message) {
  const tab = await currentTab();
  if (!tab?.id) throw new Error("找不到当前标签页");
  return chrome.tabs.sendMessage(tab.id, message);
}

async function analyze() {
  try {
    const info = await send({ type: "CAMPUS_AUTOFILL_ANALYZE" });
    if (!info?.supported) throw new Error("当前页面不是已支持的网申页面");
    statusEl.textContent = `已识别：${info.adapter}`;
    summaryEl.hidden = false;
    summaryEl.textContent = `${info.fields} 个可见/已渲染输入控件。${info.note}`;
    fillButton.disabled = false;
  } catch (error) {
    statusEl.textContent = error.message || "无法连接当前页面，请刷新后重试";
  }
}

fillButton.addEventListener("click", async () => {
  fillButton.disabled = true;
  fillButton.textContent = "正在填写…";
  resultEl.hidden = true;
  try {
    const response = await send({
      type: "CAMPUS_AUTOFILL_FILL",
      overwrite: document.getElementById("overwrite").checked
    });
    if (!response?.ok) throw new Error(response?.error || "填写失败");
    const report = response.report;
    resultEl.hidden = false;
    resultEl.innerHTML = `
      <strong>完成：${report.filled.length} 项</strong>
      <span>跳过 ${report.skipped.length} 项，待手工确认 ${report.missing.length} 项。</span>
      ${report.warnings.map((item) => `<span>• ${item}</span>`).join("")}
    `;
  } catch (error) {
    resultEl.hidden = false;
    resultEl.textContent = error.message || "填写失败，请刷新页面重试";
  } finally {
    fillButton.disabled = false;
    fillButton.textContent = "填写当前页面";
  }
});

document.getElementById("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
analyze();
