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

  function fillCareer(profile, report, overwrite) {
    const record = profile.internships?.[0];
    if (!record) return;
    fillSelector('[id="career[1].company"]', record.company, report, "工作经历 公司", overwrite);
    fillSelector('[id="career[1].title"]', record.role, report, "工作经历 职位", overwrite);
    fillSelector('[id="career[1].desc"]', record.description, report, "工作经历 描述", overwrite);
  }

  function analyze() {
    return {
      adapter: "飞书 ATS",
      supported: detect(),
      fields: document.querySelectorAll("input, textarea, [role=combobox]").length,
      note: "支持飞书 ATS 基础信息、教育经历和当前已展开的工作经历；动态区块和附件保留手工确认。"
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
    report.warnings.push("手机号由招聘平台账号带入；意向城市、教育/工作起止月份、附件、动态新增区块和最终提交仍保留手工确认。");
    return report;
  }

  globalThis.CampusAutofillFeishu = { detect, analyze, fill };
})();
