const PROFILE_KEY = "campusAutofillProfile";
let profile;

const recordSchemas = {
  education: [
    ["school", "学校"], ["degree", "学历"], ["major", "专业"], ["department", "院系"],
    ["location", "就读地"], ["startDate", "开始时间"], ["endDate", "结束时间"], ["current", "至今", "checkbox"],
    ["gpa", "GPA"], ["gpaBase", "满绩"], ["rank", "排名"], ["advisor", "导师"],
    ["laboratory", "实验室"], ["research", "研究方向", "textarea"], ["paper", "论文", "textarea"]
  ],
  internships: [
    ["company", "公司"], ["department", "部门"], ["role", "职位"],
    ["startDate", "开始时间"], ["endDate", "结束时间"], ["current", "至今", "checkbox"], ["description", "工作描述", "textarea"]
  ],
  projects: [
    ["name", "项目名称"], ["role", "项目角色"], ["startDate", "开始时间"],
    ["endDate", "结束时间"], ["current", "至今", "checkbox"], ["description", "项目描述", "textarea"]
  ],
  awards: [["type", "获奖类型"], ["name", "奖项名称"], ["year", "年份"], ["description", "说明"]]
};

function getPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((item, key) => (item[key] ??= {}), object);
  target[last] = value;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function renderRecords(type) {
  const container = document.getElementById(`${type}-list`);
  const records = profile[type] || [];
  container.innerHTML = records.map((record, index) => `
    <article class="record-card" data-record-type="${type}" data-record-index="${index}">
      <div class="record-title"><strong>${type === "education" ? "教育" : type === "internships" ? "实习" : type === "projects" ? "项目" : "获奖"} ${index + 1}</strong><button class="danger-link" data-remove="${type}" data-index="${index}">删除</button></div>
      <div class="form-grid">
        ${recordSchemas[type].map(([key, label, kind]) => `
          <label class="${kind === "textarea" ? "span-two" : ""}">${label}
            ${kind === "textarea"
              ? `<textarea data-record-key="${key}">${escapeHtml(record[key])}</textarea>`
              : kind === "checkbox"
                ? `<input type="checkbox" data-record-key="${key}" ${record[key] ? "checked" : ""}>`
                : `<input data-record-key="${key}" value="${escapeHtml(record[key])}">`}
          </label>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function render() {
  document.querySelectorAll("[data-path]").forEach((element) => {
    const value = getPath(profile, element.dataset.path);
    if (element.type === "checkbox") element.checked = Boolean(value);
    else if (element.dataset.array === "true") element.value = (value || []).join("，");
    else element.value = value ?? "";
  });
  Object.keys(recordSchemas).forEach(renderRecords);
}

function collect() {
  document.querySelectorAll("[data-path]").forEach((element) => {
    let value = element.type === "checkbox" ? element.checked : element.value.trim();
    if (element.dataset.array === "true") value = value.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
    setPath(profile, element.dataset.path, value);
  });

  document.querySelectorAll("[data-record-type]").forEach((card) => {
    const record = profile[card.dataset.recordType][Number(card.dataset.recordIndex)];
    card.querySelectorAll("[data-record-key]").forEach((element) => {
      record[element.dataset.recordKey] = element.type === "checkbox" ? element.checked : element.value.trim();
    });
  });
}

async function load() {
  const stored = await chrome.storage.local.get(PROFILE_KEY);
  if (stored[PROFILE_KEY]) profile = stored[PROFILE_KEY];
  else profile = await (await fetch(chrome.runtime.getURL("data/default-profile.json"))).json();
  render();
}

async function save() {
  collect();
  await chrome.storage.local.set({ [PROFILE_KEY]: profile });
  const status = document.getElementById("save-status");
  status.textContent = `已保存到本机：${new Date().toLocaleTimeString("zh-CN")}`;
  setTimeout(() => { status.textContent = ""; }, 3000);
}

document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => {
  collect();
  const type = button.dataset.add;
  profile[type].push(Object.fromEntries(recordSchemas[type].map(([key, _label, kind]) => [key, kind === "checkbox" ? false : ""])));
  renderRecords(type);
}));

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  collect();
  profile[button.dataset.remove].splice(Number(button.dataset.index), 1);
  renderRecords(button.dataset.remove);
});

document.getElementById("save").addEventListener("click", save);
document.getElementById("export").addEventListener("click", () => {
  collect();
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "campus-autofill-profile.json";
  link.click();
  URL.revokeObjectURL(url);
});
document.getElementById("import").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  profile = JSON.parse(await file.text());
  render();
  await save();
});

load();
