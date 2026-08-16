(function () {
  "use strict";
  const C = globalThis.CampusAutofill;

  function detect() {
    const atsx = document.querySelector('.atsx-input, .atsx-select-selection, [data-test="nameInput"]');
    return Boolean(atsx && !document.querySelector(".form-item--phoenix"));
  }

  function one(selector, root = document) {
    return root.querySelector(selector);
  }

  function fillSelector(selector, value, report, label, overwrite) {
    if (!C.text(value)) return false;
    const control = one(selector);
    if (!control) {
      report.missing.push(label);
      return false;
    }
    const result = C.setValue(control, value, overwrite);
    if (result.ok) report.filled.push(label);
    else report.skipped.push(`${label}：${result.reason}`);
    return result.ok;
  }

  function visible(element) {
    return C.isVisible(element);
  }

  function exactOption(value) {
    const wanted = C.normalize(value);
    return [...document.querySelectorAll('[role="option"], .atsx-select-dropdown-menu-item, li')]
      .filter(visible)
      .find((element) => C.normalize(element.textContent) === wanted);
  }

  async function choose(selector, value, report, label, overwrite) {
    if (!C.text(value)) return false;
    const control = one(selector);
    if (!control) {
      report.missing.push(label);
      return false;
    }
    const container = control.matches('[role="combobox"]') ? control : control.closest('[role="combobox"]');
    if (!container) {
      report.missing.push(label);
      return false;
    }
    const current = C.normalize(container.textContent || "");
    if (!overwrite && current && !current.includes("请选择") && !current.includes("请输入") && current.includes(C.normalize(value))) {
      report.skipped.push(`${label}：网页已有内容`);
      return true;
    }
    container.click();
    await C.delay(180);
    const option = exactOption(value);
    if (!option) {
      report.missing.push(`${label}（未找到选项：${value}）`);
      return false;
    }
    option.click();
    await C.delay(120);
    report.filled.push(label);
    return true;
  }

  function educationSelector(index, field) {
    return `[id="education[${index}].${field}"]`;
  }

  function fillEducation(profile, report, overwrite) {
    const record = profile.education?.[0];
    if (!record) return;
    fillSelector(educationSelector(1, "fieldOfStudy"), record.major, report, "教育经历 专业", overwrite);
    fillSelector(educationSelector(1, "school"), record.school, report, "教育经历 学校", overwrite);
  }

  function indexedControl(prefix, index, fields) {
    for (const field of fields) {
      const control = one(`[id="${prefix}[${index}].${field}"]`);
      if (control) return control;
    }
    return null;
  }

  function indexedRoots(prefixes, identityFields) {
    const roots = [];
    prefixes.forEach((prefix) => {
      document.querySelectorAll(`[id^="${prefix}["]`).forEach((control) => {
        const match = control.id.match(new RegExp(`^${prefix}\\[(\\d+)\\]\\.(${identityFields.join("|")})$`));
        if (match) roots.push({ prefix, index: Number(match[1]) });
      });
    });
    return roots.sort((a, b) => a.index - b.index);
  }

  function fillIndexed(control, value, report, label, overwrite) {
    if (!C.text(value) || !control) return false;
    const result = C.setValue(control, value, overwrite);
    if (result.ok) report.filled.push(label);
    else report.skipped.push(`${label}：${result.reason}`);
    return result.ok;
  }

  function fillCareer(profile, report, overwrite) {
    const records = profile.internships || [];
    const roots = indexedRoots(["career"], ["company", "companyName", "employer", "organization"]);
    const matched = C.matchRecordsToRoots(
      records,
      roots,
      (root) => indexedControl(root.prefix, root.index, ["company", "companyName", "employer", "organization"])?.value,
      (record) => record.company
    );
    matched.matches.forEach(({ root, record, recordIndex }) => {
      if (!record) return;
      const prefix = `工作/实习经历 ${recordIndex + 1}`;
      fillIndexed(indexedControl(root.prefix, root.index, ["company", "companyName", "employer", "organization"]), record.company, report, `${prefix} 公司`, overwrite);
      fillIndexed(indexedControl(root.prefix, root.index, ["department"]), record.department, report, `${prefix} 部门`, overwrite);
      fillIndexed(indexedControl(root.prefix, root.index, ["title", "position", "role"]), record.role, report, `${prefix} 职位`, overwrite);
      fillIndexed(indexedControl(root.prefix, root.index, ["desc", "description", "responsibility"]), record.description, report, `${prefix} 描述`, overwrite);
    });
    matched.unmatchedRecordIndexes.forEach((index) => report.missing.push(`工作/实习经历 ${index + 1} 尚未在网页添加或无法按公司匹配`));
  }

  function fillProjects(profile, report, overwrite) {
    const records = profile.projects || [];
    const roots = indexedRoots(["project", "projects", "projectExperience"], ["name", "projectName", "title"]);
    const matched = C.matchRecordsToRoots(
      records,
      roots,
      (root) => indexedControl(root.prefix, root.index, ["name", "projectName", "title"])?.value,
      (record) => record.name
    );
    matched.matches.forEach(({ root, record, recordIndex }) => {
      if (!record) return;
      const prefix = `项目经历 ${recordIndex + 1}`;
      fillIndexed(indexedControl(root.prefix, root.index, ["name", "projectName", "title"]), record.name, report, `${prefix} 名称`, overwrite);
      fillIndexed(indexedControl(root.prefix, root.index, ["role", "position"]), record.role, report, `${prefix} 角色`, overwrite);
      fillIndexed(indexedControl(root.prefix, root.index, ["achievement", "result"]), record.achievement, report, `${prefix} 成果`, overwrite);
      fillIndexed(indexedControl(root.prefix, root.index, ["desc", "description"]), record.description, report, `${prefix} 描述`, overwrite);
    });
    matched.unmatchedRecordIndexes.forEach((index) => report.missing.push(`项目经历 ${index + 1} 尚未在网页添加或无法按名称匹配`));
  }

  function analyze() {
    return {
      adapter: "飞书 ATS",
      supported: detect(),
      fields: document.querySelectorAll("input, textarea, [role=combobox]").length,
      note: "支持飞书 ATS 基础信息、教育经历，以及当前已展开的工作/实习与项目经历。"
    };
  }

  async function fill(profile, options = {}) {
    const report = C.createReport("飞书 ATS");
    const p = profile.personal || {};
    const overwrite = Boolean(options.overwrite);
    fillSelector('[data-test="nameInput"]', p.name, report, "姓名", overwrite);
    fillSelector('[data-test="emailInput"]', p.email, report, "邮箱", overwrite);
    fillSelector("#id", p.idNumber, report, "身份证号", overwrite);
    await choose('[id="education[1].degree"]', profile.education?.[0]?.degree === "硕士研究生" ? "硕士" : profile.education?.[0]?.degree, report, "教育经历 学历", overwrite);
    fillEducation(profile, report, overwrite);
    fillCareer(profile, report, overwrite);
    fillProjects(profile, report, overwrite);
    report.warnings.push("手机号由招聘平台账号带入；意向城市、教育/工作起止月份、附件、动态新增区块和最终提交仍保留手工确认。");
    return report;
  }

  globalThis.CampusAutofillFeishu = { detect, analyze, fill };
})();
