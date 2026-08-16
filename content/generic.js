(function () {
  "use strict";
  const C = globalThis.CampusAutofill;

  const ROOT_SELECTORS = [
    ".form-part-body", ".info_list", ".form-item-group", ".form-section",
    ".experience-item", ".experience-card", ".record-item", ".resume-item",
    "fieldset", "article", "section", "li", "form", "div"
  ].join(",");

  const SCHEMAS = {
    internships: {
      title: "实习/工作经历",
      records: (profile) => profile.internships || [],
      identity: (record) => record.company,
      fields: {
        identity: /(?:实习)?公司(?:\s*\/\s*组织)?(?:名称)?|单位名称|工作单位|雇主|company|employer/i,
        department: /部门|事业部|department/i,
        role: /职位(?:名称)?|职务|岗位(?:名称)?|title|position|role/i,
        startDate: /开始时间|入职时间|起始时间|start\s*date/i,
        endDate: /结束时间|离职时间|终止时间|end\s*date/i,
        description: /工作职责|岗位职责|实习内容|工作内容|经历描述|职责描述|工作描述|description|responsibilit/i
      },
      values: {
        identity: (record) => record.company,
        department: (record) => record.department,
        role: (record) => record.role,
        startDate: (record) => record.startDate,
        endDate: (record) => record.endDate,
        description: (record) => record.description
      }
    },
    projects: {
      title: "项目经历",
      records: (profile) => profile.projects || [],
      identity: (record) => record.name,
      fields: {
        identity: /项目名称|项目名|课题名称|实践名称|project\s*name|project\s*title/i,
        role: /项目角色|担任角色|项目职务|本人角色|职位|职务|岗位|role|position/i,
        startDate: /开始时间|起始时间|start\s*date/i,
        endDate: /结束时间|终止时间|end\s*date/i,
        achievement: /项目成果|项目业绩|项目亮点|成果|achievement|result|outcome/i,
        description: /项目描述|项目内容|项目介绍|实践描述|项目职责|description/i
      },
      values: {
        identity: (record) => record.name,
        role: (record) => record.role,
        startDate: (record) => record.startDate,
        endDate: (record) => record.endDate,
        achievement: (record) => record.achievement,
        description: (record) => record.description
      }
    }
  };

  function controls(root = document) {
    return [...root.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="password"]), textarea, select, [contenteditable="true"]')]
      .filter((control) => C.isVisible(control) && !control.disabled);
  }

  function ownText(element) {
    return [...(element?.childNodes || [])]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ");
  }

  function fieldText(control) {
    const parts = [
      control.getAttribute("aria-label"), control.getAttribute("placeholder"),
      control.getAttribute("name"), control.id
    ];
    if (control.id && globalThis.CSS?.escape) {
      parts.push(document.querySelector(`label[for="${CSS.escape(control.id)}"]`)?.textContent);
    }
    const label = control.closest("label");
    if (label) parts.push(ownText(label));
    const wrapper = control.closest(".form-item, .form-group, .field, .atsx-form-item, [class*=FormItem], [class*=formItem]");
    if (wrapper) {
      parts.push(wrapper.querySelector("label, legend, [class*=label], [class*=Label]")?.textContent);
    }
    return C.normalize(parts.filter(Boolean).join(" "));
  }

  function fieldKind(control, schema) {
    const description = fieldText(control);
    return Object.entries(schema.fields).find(([, pattern]) => pattern.test(description))?.[0] || "";
  }

  function rootFor(anchor, schema) {
    let candidate = anchor.parentElement;
    while (candidate && candidate !== document.body) {
      if (!candidate.matches(ROOT_SELECTORS)) {
        candidate = candidate.parentElement;
        continue;
      }
      const fields = controls(candidate).filter((control) => fieldKind(control, schema));
      const identities = fields.filter((control) => fieldKind(control, schema) === "identity");
      if (fields.length >= 2 && identities.length === 1) return candidate;
      if (identities.length > 1) return null;
      candidate = candidate.parentElement;
    }
    return null;
  }

  function recordRoots(schema) {
    const anchors = controls().filter((control) => fieldKind(control, schema) === "identity");
    return [...new Set(anchors.map((anchor) => rootFor(anchor, schema)).filter(Boolean))];
  }

  function controlFor(root, schema, kind) {
    return controls(root).find((control) => fieldKind(control, schema) === kind) || null;
  }

  function controlValue(control) {
    if (!control) return "";
    if (control.isContentEditable) return C.text(control.textContent);
    return C.text(control.value);
  }

  function dateForControl(control, value) {
    if (!value) return "";
    if (control.type === "month") return value.slice(0, 7);
    if (control.type === "date" && /^\d{4}-\d{2}$/.test(value)) return "";
    return value;
  }

  function setControl(control, value, overwrite) {
    const next = dateForControl(control, C.text(value));
    if (!control || !next) return { ok: false, reason: "不可填写或资料为空" };
    if (!overwrite && controlValue(control)) return { ok: false, reason: "网页已有内容" };
    if (control instanceof HTMLSelectElement) {
      const wanted = C.normalize(next);
      const option = [...control.options].find((item) => {
        const label = C.normalize(item.textContent);
        return label === wanted || label.includes(wanted) || wanted.includes(label);
      });
      if (!option) return { ok: false, reason: `未找到选项：${next}` };
      control.value = option.value;
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    }
    if (control.isContentEditable) {
      control.focus();
      control.textContent = next;
      control.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: next }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
      control.blur();
      return { ok: true };
    }
    return C.setValue(control, next, overwrite);
  }

  function fillKind(kind, profile, report, options) {
    const schema = SCHEMAS[kind];
    const records = schema.records(profile);
    if (!records.length) return;
    const roots = recordRoots(schema);
    if (!roots.length) return;
    const matched = C.matchRecordsToRoots(
      records,
      roots,
      (root) => controlValue(controlFor(root, schema, "identity")),
      schema.identity
    );
    matched.matches.forEach(({ root, record, recordIndex }) => {
      if (!record) return;
      Object.entries(schema.values).forEach(([field, getValue]) => {
        const value = getValue(record);
        if (!C.text(value)) return;
        const control = controlFor(root, schema, field);
        if (!control) return;
        const label = `${schema.title} ${recordIndex + 1} ${field === "identity" ? "名称" : field}`;
        const result = setControl(control, value, options.overwrite);
        if (result.ok) report.filled.push(label);
        else report.skipped.push(`${label}：${result.reason}`);
      });
    });
    matched.unmatchedRecordIndexes.forEach((index) => {
      report.missing.push(`${schema.title} ${index + 1} 尚未在网页添加或无法按名称匹配`);
    });
  }

  function detect() {
    if (!controls().length) return false;
    return Object.values(SCHEMAS).some((schema) => recordRoots(schema).length > 0);
  }

  function analyze() {
    return {
      adapter: "通用经历表单",
      supported: detect(),
      fields: controls().length,
      note: "已按字段标签识别实习/工作与项目经历；优先按公司名或项目名匹配已有卡片。"
    };
  }

  async function fillExperiences(profile, options = {}) {
    const report = C.createReport("通用经历表单");
    fillKind("internships", profile, report, options);
    fillKind("projects", profile, report, options);
    if (report.filled.length || report.missing.length) {
      report.warnings.push("通用适配只填写已渲染的经历区块，不会自动新增、删除或提交。请核对日期与自定义下拉框。");
    }
    return report;
  }

  globalThis.CampusAutofillGeneric = { detect, analyze, fill: fillExperiences, fillExperiences };
})();
