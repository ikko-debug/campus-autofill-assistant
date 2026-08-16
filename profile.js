(function () {
  "use strict";

  const CURRENT_SCHEMA_VERSION = 1;
  const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const STRING_ARRAY_PATHS = new Set(["intent.desiredCities", "skills.programming", "skills.tools"]);
  const OBJECT_ARRAY_PATHS = new Set(["education", "internships", "projects", "awards", "languages"]);

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function assertSafeJson(value, path = "资料") {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertSafeJson(item, `${path}[${index}]`));
      return;
    }
    if (!isPlainObject(value)) throw new Error(`${path} 必须是普通 JSON 对象`);
    Object.entries(value).forEach(([key, item]) => {
      if (BLOCKED_KEYS.has(key)) throw new Error(`${path} 包含不安全字段：${key}`);
      assertSafeJson(item, `${path}.${key}`);
    });
  }

  function mergeKnown(defaultValue, inputValue, path) {
    if (Array.isArray(defaultValue)) {
      if (!Array.isArray(inputValue)) throw new Error(`${path} 必须是数组`);
      assertSafeJson(inputValue, path);
      if (STRING_ARRAY_PATHS.has(path) && inputValue.some((item) => typeof item !== "string")) {
        throw new Error(`${path} 只能包含字符串`);
      }
      if (OBJECT_ARRAY_PATHS.has(path) && inputValue.some((item) => !isPlainObject(item))) {
        throw new Error(`${path} 只能包含对象`);
      }
      return structuredClone(inputValue);
    }
    if (isPlainObject(defaultValue)) {
      if (!isPlainObject(inputValue)) throw new Error(`${path} 必须是对象`);
      const result = {};
      Object.keys(defaultValue).forEach((key) => {
        const nextPath = path ? `${path}.${key}` : key;
        result[key] = Object.hasOwn(inputValue, key)
          ? mergeKnown(defaultValue[key], inputValue[key], nextPath)
          : structuredClone(defaultValue[key]);
      });
      return result;
    }
    if (typeof inputValue !== typeof defaultValue) {
      throw new Error(`${path} 的类型应为 ${typeof defaultValue}`);
    }
    return inputValue;
  }

  function normalize(input, defaults) {
    if (!isPlainObject(defaults)) throw new Error("默认资料格式无效");
    if (!isPlainObject(input)) throw new Error("导入文件顶层必须是 JSON 对象");
    assertSafeJson(input);
    const version = input.schemaVersion ?? 0;
    if (!Number.isInteger(version) || version < 0) throw new Error("schemaVersion 必须是非负整数");
    if (version > CURRENT_SCHEMA_VERSION) {
      throw new Error(`资料版本 ${version} 高于当前支持版本 ${CURRENT_SCHEMA_VERSION}`);
    }
    const result = mergeKnown(defaults, input, "");
    result.schemaVersion = CURRENT_SCHEMA_VERSION;
    return result;
  }

  globalThis.CampusAutofillProfile = { CURRENT_SCHEMA_VERSION, normalize };
})();
