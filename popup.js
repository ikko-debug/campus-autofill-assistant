const statusEl = document.getElementById("site-status");
const summaryEl = document.getElementById("page-summary");
const resultEl = document.getElementById("result");
const fillButton = document.getElementById("fill");
const PROFILE_KEY = "campusAutofillProfile";
const CONTENT_SCRIPTS = [
  "content/common.js", "content/moka.js", "content/tencent.js", "content/zhiye.js",
  "content/feishu.js", "content/generic.js", "content/index.js"
];

async function currentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function send(message) {
  const tab = await currentTab();
  if (!tab?.id) throw new Error("找不到当前标签页");
  try {
    const ping = await chrome.tabs.sendMessage(tab.id, { type: "CAMPUS_AUTOFILL_PING" });
    if (!ping?.ready) throw new Error("内容脚本尚未就绪");
  } catch (_error) {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content/toast.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_SCRIPTS });
  }
  return chrome.tabs.sendMessage(tab.id, message);
}

async function loadPreferences() {
  const stored = await chrome.storage.local.get(PROFILE_KEY);
  document.getElementById("overwrite").checked = stored[PROFILE_KEY]?.settings?.fillOnlyEmpty === false;
}

function renderReport(report) {
  resultEl.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = `完成：${report.filled.length} 项`;
  const summary = document.createElement("span");
  summary.textContent = `跳过 ${report.skipped.length} 项，待手工确认 ${report.missing.length} 项。`;
  resultEl.append(title, summary);
  report.warnings.forEach((warning) => {
    const item = document.createElement("span");
    item.textContent = `• ${warning}`;
    resultEl.append(item);
  });
  [
    ["已填写明细", report.filled],
    ["跳过明细", report.skipped],
    ["待确认明细", report.missing]
  ].forEach(([label, values]) => {
    if (!values.length) return;
    const details = document.createElement("details");
    const heading = document.createElement("summary");
    heading.textContent = `${label}（${values.length}）`;
    const list = document.createElement("ul");
    values.forEach((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      list.append(item);
    });
    details.append(heading, list);
    resultEl.append(details);
  });
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
    renderReport(report);
  } catch (error) {
    resultEl.hidden = false;
    resultEl.textContent = error.message || "填写失败，请刷新页面重试";
  } finally {
    fillButton.disabled = false;
    fillButton.textContent = "填写当前页面";
  }
});

document.getElementById("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
loadPreferences().then(analyze).catch(analyze);
