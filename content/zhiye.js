(function () {
  "use strict";
  const C = globalThis.CampusAutofill;

  function detect() {
    return location.hostname.endsWith(".zhiye.com") || location.hostname === "zhiye.com" ||
      location.hostname === "campus.hundsun.com" || location.hostname === "we.zyt.com";
  }

  function labelOf(item) {
    return C.normalize(item?.querySelector(".form-item__text")?.textContent || "");
  }

  function items(root = document) {
    return [...root.querySelectorAll(".form-item")];
  }

  function item(label, root = document) {
    const wanted = C.normalize(label);
    return items(root).find((candidate) => labelOf(candidate) === wanted) || null;
  }

  function itemAny(labels, root = document) {
    return (Array.isArray(labels) ? labels : [labels]).map((label) => item(label, root)).find(Boolean) || null;
  }

  function textControl(label, root = document) {
    const current = item(label, root);
    if (!current) return null;
    return current.querySelector(
      'input.phoenix-input__input:not([type="file"]), textarea.phoenix-textarea__realTextarea, input:not([type="file"]), textarea'
    );
  }

  function textControlAny(labels, root = document) {
    const current = itemAny(labels, root);
    return current?.querySelector(
      'input.phoenix-input__input:not([type="file"]), textarea.phoenix-textarea__realTextarea, input:not([type="file"]), textarea'
    ) || null;
  }

  function selectControl(label, root = document) {
    return item(label, root)?.querySelector(".phoenix-select__input");
  }

  function selectControlAny(labels, root = document) {
    return itemAny(labels, root)?.querySelector(".phoenix-select__input") || null;
  }

  function visible(element) {
    return C.isVisible(element);
  }

  function typeIntoSelect(control, value) {
    if (!control || control.readOnly || control.disabled) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(control, value);
    else control.value = value;
    control.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }

  function exactTextCandidate(value) {
    const wanted = C.normalize(value);
    const candidates = [...document.querySelectorAll(
      '[role="option"], .phoenix-select__option, [class*="phoenix-option"], li, [class*="option"], [class*="Option"]'
    )].filter(visible).filter((candidate) => C.normalize(candidate.textContent) === wanted);
    if (candidates.length) return candidates[candidates.length - 1];
    const fuzzy = [...document.querySelectorAll(
      '[role="option"], .phoenix-select__option, [class*="phoenix-option"], li, [class*="option"], [class*="Option"]'
    )].filter(visible).filter((candidate) => {
      const text = C.normalize(candidate.textContent);
      return text && (text.includes(wanted) || wanted.includes(text));
    });
    return fuzzy.length === 1 ? fuzzy[0] : null;
  }

  async function choose(label, value, report, options = {}) {
    if (!C.text(value)) return false;
    const control = selectControl(label, options.root);
    if (!control) {
      report.missing.push(options.label || label);
      return false;
    }
    const current = C.normalize(control.closest(".phoenix-select")?.textContent || "");
    if (!options.overwrite && current && current !== "请选择" && current.includes(C.normalize(value))) {
      report.skipped.push(`${options.label || label}：网页已有内容`);
      return true;
    }
    control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    control.click();
    await C.delay(120);
    typeIntoSelect(control, value);
    await C.delay(300);
    const option = exactTextCandidate(value) || exactTextCandidate(value.replace(/^(\d{4})-(\d{2})$/, "$1年$2月"));
    if (!option) {
      report.missing.push(`${options.label || label}（未找到选项：${value}）`);
      return false;
    }
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    option.click();
    await C.delay(120);
    report.filled.push(options.label || label);
    return true;
  }

  async function chooseAny(labels, value, report, options = {}) {
    for (const label of (Array.isArray(labels) ? labels : [labels])) {
      if (await choose(label, value, report, options)) return true;
    }
    return false;
  }

  async function chooseOneOf(labels, value, report, options = {}) {
    for (const candidate of labels) {
      if (await choose(candidate, value, report, { ...options, label: options.label || candidate })) return true;
    }
    return false;
  }

  function fillText(label, value, report, options = {}) {
    if (!C.text(value)) return false;
    const control = textControl(label, options.root);
    if (!control) {
      report.missing.push(options.label || label);
      return false;
    }
    const result = C.setValue(control, value, options.overwrite);
    if (result.ok) report.filled.push(options.label || label);
    else report.skipped.push(`${options.label || label}：${result.reason}`);
    return result.ok;
  }

  function fillTextAny(labels, value, report, options = {}) {
    if (!C.text(value)) return false;
    let control = textControlAny(labels, options.root);
    const displayLabel = options.label || (Array.isArray(labels) ? labels[0] : labels);
    let fallback = false;
    if (!control && options.root) {
      const candidates = [...options.root.querySelectorAll(
        'input.phoenix-input__input:not([type="file"]), textarea.phoenix-textarea__realTextarea, input:not([type="file"]), textarea'
      )].filter((element) => visible(element) && !element.disabled);
      if (candidates.length === 1) {
        control = candidates[0];
        fallback = true;
      }
    }
    if (!control) {
      report.missing.push(displayLabel);
      return false;
    }
    const result = C.setValue(control, value, options.overwrite);
    if (result.ok) {
      report.filled.push(displayLabel);
      if (fallback) report.warnings.push(`${displayLabel}：页面标签未匹配，已尝试填写区块内唯一文本框`);
    }
    else report.skipped.push(`${displayLabel}：${result.reason}`);
    return result.ok;
  }

  function recordValue(record, keys) {
    for (const key of keys) {
      if (C.text(record?.[key])) return record[key];
    }
    return "";
  }

  function fillDate(label, value, report, options = {}) {
    if (!C.text(value)) return false;
    if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(value)) {
      report.warnings.push(`${options.label || label} 不是 YYYY-MM 或 YYYY-MM-DD，插件不会猜具体日期`);
      return false;
    }
    return choose(label, value, report, options);
  }

  function fillRadio(label, value, report, options = {}) {
    if (!C.text(value)) return false;
    const current = item(label, options.root);
    if (!current) {
      report.missing.push(options.label || label);
      return false;
    }
    const choice = [...current.querySelectorAll(".phoenix-radio, label, [role=radio]")]
      .find((element) => C.normalize(element.textContent) === C.normalize(value));
    if (!choice) {
      report.missing.push(`${options.label || label}（未找到选项：${value}）`);
      return false;
    }
    if (!options.overwrite && choice.classList.contains("phoenix-radio--checked")) {
      report.skipped.push(`${options.label || label}：网页已有内容`);
      return true;
    }
    choice.click();
    report.filled.push(options.label || label);
    return true;
  }

  function recordRoots(label) {
    return [...document.querySelectorAll(".form-part-body")].filter((root) => item(label, root));
  }

  function recordRootsAny(labels) {
    return [...document.querySelectorAll(".form-part-body")].filter((root) => itemAny(labels, root));
  }

  async function ensureRecordCount(label, buttonText, wanted, report) {
    const labels = Array.isArray(label) ? label : [label];
    const buttons = Array.isArray(buttonText) ? buttonText : [buttonText];
    if (!wanted) return recordRootsAny(labels);
    let roots = recordRootsAny(labels);
    while (roots.length < wanted) {
      const button = [...document.querySelectorAll("button, a, div, span")]
        .filter(visible)
        .find((candidate) => buttons.some((text) => C.normalize(candidate.textContent) === C.normalize(text)));
      if (!button) {
        report.missing.push(`${buttons[0]}（网页未找到添加按钮）`);
        break;
      }
      button.click();
      await C.delay(180);
      const nextRoots = recordRootsAny(labels);
      if (nextRoots.length <= roots.length) break;
      roots = nextRoots;
    }
    return roots;
  }

  async function fillEducation(profile, report, options) {
    const records = profile.education || [];
    const roots = await ensureRecordCount(["毕业学校", "学校名称"], "添加教育经历", records.length, report);
    for (const [index, root] of roots.entries()) {
      const record = records[index];
      if (!record) continue;
      const prefix = `教育 ${index + 1}`;
      fillDate("开始时间", record.startDate, report, { root, label: `${prefix} 开始时间`, overwrite: options.overwrite });
      fillDate("结束时间", record.endDate, report, { root, label: `${prefix} 结束时间`, overwrite: options.overwrite });
      await chooseOneOf(["学历"], record.degree, report, { root, label: `${prefix} 学历`, overwrite: options.overwrite });
      fillTextAny(["毕业学校", "学校名称"], record.school, report, { root, label: `${prefix} 学校`, overwrite: options.overwrite });
      fillTextAny(["专业", "专业名称"], record.major, report, { root, label: `${prefix} 专业`, overwrite: options.overwrite });
      const degree = C.normalize(record.degree) === "硕士研究生" ? "硕士" : record.degree;
      await choose("学位", degree, report, { root, label: `${prefix} 学位`, overwrite: options.overwrite });
    }
    records.slice(roots.length).forEach((_record, index) => report.missing.push(`教育 ${roots.length + index + 1} 尚未在网页添加`));
  }

  async function fillInternships(profile, report, options) {
    const records = profile.internships || [];
    const roots = await ensureRecordCount(["公司名称", "单位名称"], ["添加工作/实习经历", "添加实习经历", "添加工作经历"], records.length, report);
    const dutyRoots = recordRootsAny(["工作职责", "实习内容"]);
    roots.forEach((root, index) => {
      const record = records[index];
      if (!record) return;
      const prefix = `实习 ${index + 1}`;
      fillTextAny(["公司名称", "单位名称"], record.company, report, { root, label: `${prefix} 公司`, overwrite: options.overwrite });
      fillTextAny(["职位名称", "职位", "职务"], record.role, report, { root, label: `${prefix} 职位`, overwrite: options.overwrite });
      fillDate("开始时间", record.startDate, report, { root, label: `${prefix} 开始时间`, overwrite: options.overwrite });
      fillDate("结束时间", record.endDate, report, { root, label: `${prefix} 结束时间`, overwrite: options.overwrite });
      fillTextAny(["工作职责", "实习内容"], recordValue(record, ["description", "workDescription", "jobDescription", "responsibility", "duties", "workContent", "desc"]), report, { root: dutyRoots[index] || root, label: `${prefix} 工作职责`, overwrite: options.overwrite });
      if (record.current) {
        const checkbox = [...root.querySelectorAll('input[type="checkbox"]')][0];
        if (checkbox && !checkbox.checked) {
          (checkbox.closest("label, .phoenix-checkbox, .phoenix-checkbox__box") || checkbox).click();
          report.filled.push(`${prefix} 至今`);
        }
      }
    });
    records.slice(roots.length).forEach((_record, index) => report.missing.push(`实习 ${roots.length + index + 1} 尚未在网页添加`));
  }

  async function fillProjects(profile, report, options) {
    const records = profile.projects || [];
    const roots = await ensureRecordCount("项目名称", "添加项目经历", records.length, report);
    const descriptionRoots = recordRoots("项目描述");
    roots.forEach((root, index) => {
      const record = records[index];
      if (!record) return;
      const prefix = `项目 ${index + 1}`;
      fillText("项目名称", record.name, report, { root, label: `${prefix} 名称`, overwrite: options.overwrite });
      fillText("职务", record.role, report, { root, label: `${prefix} 职务`, overwrite: options.overwrite });
      fillDate("开始时间", record.startDate, report, { root, label: `${prefix} 开始时间`, overwrite: options.overwrite });
      fillDate("结束时间", record.endDate, report, { root, label: `${prefix} 结束时间`, overwrite: options.overwrite });
      fillText("项目成果", recordValue(record, ["achievement", "achievements", "result", "results", "outcome", "成果"]), report, { root, label: `${prefix} 项目成果`, overwrite: options.overwrite });
      fillText("项目描述", recordValue(record, ["description", "projectDescription", "desc"]), report, { root: descriptionRoots[index] || root, label: `${prefix} 项目描述`, overwrite: options.overwrite });
      if (record.current) {
        const checkbox = [...root.querySelectorAll('input[type="checkbox"]')][0];
        if (checkbox && !checkbox.checked) {
          (checkbox.closest("label, .phoenix-checkbox, .phoenix-checkbox__box") || checkbox).click();
          report.filled.push(`${prefix} 至今`);
        }
      }
    });
    records.slice(roots.length).forEach((_record, index) => report.missing.push(`项目 ${roots.length + index + 1} 尚未在网页添加`));
  }

  async function fillAwards(profile, report, options) {
    const records = profile.awards || [];
    const roots = await ensureRecordCount("获奖项", "添加获奖情况", records.length, report);
    roots.forEach((root, index) => {
      const record = records[index];
      if (!record) return;
      const prefix = `获奖 ${index + 1}`;
      fillText("获奖项", record.name, report, { root, label: `${prefix} 名称`, overwrite: options.overwrite });
      fillDate("获奖时间", record.year, report, { root, label: `${prefix} 时间`, overwrite: options.overwrite });
      fillText("获奖描述", record.description, report, { root, label: `${prefix} 描述`, overwrite: options.overwrite });
    });
    records.slice(roots.length).forEach((_record, index) => report.missing.push(`获奖 ${roots.length + index + 1} 尚未在网页添加`));
  }

  function analyze() {
    return {
      adapter: "北森 Beisen",
      supported: detect(),
      fields: document.querySelectorAll("input, textarea").length,
      note: "支持北森 Phoenix 文本框、单选、下拉和当前已展开的教育/实习/项目/获奖区块。"
    };
  }

  async function fill(profile, options = {}) {
    const report = C.createReport("北森 Beisen");
    const p = profile.personal || {};
    const intent = profile.intent || {};
    const contacts = profile.contacts || {};
    const overwrite = Boolean(options.overwrite);

    fillText("姓名", p.name, report, { label: "姓名", overwrite });
    fillRadio("性别", p.gender, report, { label: "性别", overwrite });
    fillText("健康状况", p.health, report, { label: "健康状况", overwrite });
    fillTextAny(["身份证号", "证件号码"], p.idNumber, report, { label: "身份证号", overwrite });
    fillTextAny(["手机号", "手机号码"], p.phone, report, { label: "手机号", overwrite });
    fillText("邮箱", p.email, report, { label: "邮箱", overwrite });
    fillTextAny(["期望薪酬", "期望薪资"], intent.expectedSalary, report, { label: "期望薪酬", overwrite });
    fillText("您的意向工作地排序", (intent.desiredCities || []).join("、"), report, { label: "意向工作地", overwrite });
    fillText("兴趣爱好", profile.additional?.hobbies, report, { label: "兴趣爱好", overwrite });
    fillText("专利成果", profile.additional?.patents, report, { label: "专利成果", overwrite });

    await choose("意向工作地点", intent.desiredCities?.[0], report, { label: "意向工作地点", overwrite });
    fillDate("出生日期", p.birthDate, report, { label: "出生日期", overwrite });
    await choose("民族", p.nation, report, { label: "民族", overwrite });
    await fillRadio("婚否", p.maritalStatus, report, { label: "婚否", overwrite });
    await choose("最高学历", profile.education?.[0]?.degree, report, { label: "最高学历", overwrite });
    await choose("外语水平", profile.languages?.[0]?.certificate, report, { label: "外语水平", overwrite });
    await choose("籍贯", p.nativePlace, report, { label: "籍贯", overwrite });

    await fillEducation(profile, report, { overwrite });
    await fillInternships(profile, report, { overwrite });
    await fillAwards(profile, report, { overwrite });
    await fillProjects(profile, report, { overwrite });
    report.warnings.push("上传简历、地区级联、日期精确到日和最终提交仍保留手工确认。");
    return report;
  }

  globalThis.CampusAutofillZhiye = { detect, analyze, fill };
})();
