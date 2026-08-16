(function () {
  "use strict";

  const PROFILE_KEY = "campusAutofillProfile";
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (value) => String(value ?? "").trim();
  const normalize = (value) => text(value).replace(/\s+/g, " ").toLowerCase();

  function isVisible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  }

  function nativeSetter(element) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    return Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  }

  function setValue(element, value, overwrite = false) {
    const next = text(value);
    if (!element || !next || element.disabled) return { ok: false, reason: "不可填写或资料为空" };
    if (!overwrite && text(element.value)) return { ok: false, reason: "网页已有内容" };

    element.focus();
    const setter = nativeSetter(element);
    if (setter) setter.call(element, next);
    else element.value = next;
    // Phoenix/React textareas listen to the bubbling input event; use a plain
    // Event as a fallback because some browsers reject very long InputEvent data.
    try {
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: next }));
    } catch (_error) {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "End" }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    return { ok: true };
  }

  function fieldsByPlaceholder(placeholder, root = document) {
    return [...root.querySelectorAll("input, textarea")].filter(
      (element) => element.getAttribute("placeholder") === placeholder && isVisible(element)
    );
  }

  function fillByPlaceholder(placeholder, value, report, options = {}) {
    if (!text(value)) return false;
    const index = options.index ?? 0;
    const element = fieldsByPlaceholder(placeholder, options.root)[index];
    if (!element) {
      report.missing.push(options.label || placeholder);
      return false;
    }
    const result = setValue(element, value, options.overwrite);
    if (result.ok) report.filled.push(options.label || placeholder);
    else if (text(value)) report.skipped.push(`${options.label || placeholder}：${result.reason}`);
    return result.ok;
  }

  function fillRepeated(placeholder, values, report, options = {}) {
    const elements = fieldsByPlaceholder(placeholder, options.root);
    values.forEach((value, index) => {
      if (!text(value)) return;
      const element = elements[index];
      const label = `${options.label || placeholder} ${index + 1}`;
      if (!element) {
        report.missing.push(label);
        return;
      }
      const result = setValue(element, value, options.overwrite);
      if (result.ok) report.filled.push(label);
      else report.skipped.push(`${label}：${result.reason}`);
    });
  }

  function candidateOptions() {
    const selectors = [
      '[role="option"]',
      ".el-select-dropdown__item",
      ".el-cascader-node",
      '[class*="Select-option"]',
      '[class*="select-option"]',
      '[class*="dropdown-item"]',
      "li"
    ];
    return [...new Set(document.querySelectorAll(selectors.join(",")))].filter(isVisible);
  }

  function findOption(value, exact = true) {
    const wanted = normalize(value);
    const options = candidateOptions();
    return options.find((option) => {
      const optionText = normalize(option.textContent);
      return exact ? optionText === wanted : optionText.includes(wanted) || wanted.includes(optionText);
    });
  }

  async function chooseFromInput(input, value, report, label, options = {}) {
    if (!input || !text(value)) return false;
    if (!options.overwrite && normalize(input.value) === normalize(value)) {
      report.skipped.push(`${label}：网页已有相同内容`);
      return true;
    }

    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    input.click();
    await delay(options.waitMs ?? 250);

    let option = findOption(value, true) || findOption(value, false);
    if (!option && !input.readOnly) {
      setValue(input, value, true);
      await delay(options.waitMs ?? 300);
      option = findOption(value, true) || findOption(value, false);
    }
    if (!option) {
      report.missing.push(`${label}（未找到选项：${value}）`);
      return false;
    }

    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    option.click();
    await delay(120);
    report.filled.push(label);
    return true;
  }

  async function chooseByPlaceholder(placeholder, value, report, options = {}) {
    const element = fieldsByPlaceholder(placeholder, options.root)[options.index ?? 0];
    if (!element) {
      report.missing.push(options.label || placeholder);
      return false;
    }
    return chooseFromInput(element, value, report, options.label || placeholder, options);
  }

  function createReport(adapter) {
    return { adapter, filled: [], skipped: [], missing: [], warnings: [] };
  }

  function matchRecordsToRoots(records, roots, getRootIdentity, getRecordIdentity) {
    const remaining = new Set(records.map((_record, index) => index));
    const matches = roots.map((root) => ({ root, record: null, recordIndex: -1 }));

    // Preserve cards that already contain an identity by matching their company
    // or project name first. This avoids coupling profile order to page order.
    matches.forEach((match) => {
      const current = normalize(getRootIdentity(match.root));
      if (!current) return;
      const candidates = [...remaining].filter((index) => {
        const identity = normalize(getRecordIdentity(records[index]));
        return identity && (identity === current || identity.includes(current) || current.includes(identity));
      });
      if (candidates.length !== 1) return;
      match.recordIndex = candidates[0];
      match.record = records[candidates[0]];
      remaining.delete(candidates[0]);
    });

    // Only assign unmatched records to blank cards. Never overwrite an existing
    // but unrecognised experience with an unrelated record.
    matches.forEach((match) => {
      if (match.record) return;
      if (text(getRootIdentity(match.root))) return;
      const recordIndex = remaining.values().next().value;
      if (recordIndex === undefined) return;
      match.recordIndex = recordIndex;
      match.record = records[recordIndex];
      remaining.delete(recordIndex);
    });

    return { matches, unmatchedRecordIndexes: [...remaining] };
  }

  function mergeReports(primary, supplement) {
    const unique = (values) => [...new Set(values)];
    return {
      adapter: primary.adapter,
      filled: unique([...primary.filled, ...supplement.filled]),
      skipped: unique([...primary.skipped, ...supplement.skipped]),
      missing: unique([...primary.missing, ...supplement.missing]),
      warnings: unique([...primary.warnings, ...supplement.warnings])
    };
  }

  function showToast(message, tone = "info") {
    document.getElementById("campus-autofill-toast")?.remove();
    const toast = document.createElement("div");
    toast.id = "campus-autofill-toast";
    toast.dataset.tone = tone;
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    setTimeout(() => toast.remove(), 5000);
  }

  async function getProfile() {
    const stored = await chrome.storage.local.get(PROFILE_KEY);
    return stored[PROFILE_KEY] || null;
  }

  globalThis.CampusAutofill = {
    PROFILE_KEY,
    delay,
    text,
    normalize,
    isVisible,
    setValue,
    fieldsByPlaceholder,
    fillByPlaceholder,
    fillRepeated,
    chooseFromInput,
    chooseByPlaceholder,
    createReport,
    matchRecordsToRoots,
    mergeReports,
    showToast,
    getProfile
  };
})();
