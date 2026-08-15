(function () {
  "use strict";
  const C = globalThis.CampusAutofill;

  function detect() {
    return location.hostname === "app.mokahr.com" && location.hash.includes("/apply");
  }

  function analyze() {
    return {
      adapter: "Moka",
      supported: detect(),
      fields: document.querySelectorAll("input, textarea").length,
      note: "支持普通文本；自定义下拉、日期和地区字段会尝试匹配，未匹配项留给手工确认。"
    };
  }

  async function fill(profile, options = {}) {
    const report = C.createReport("Moka");
    const overwrite = Boolean(options.overwrite);
    const p = profile.personal || {};
    const intent = profile.intent || {};
    const education = profile.education || [];

    C.fillByPlaceholder("姓名", p.name, report, { label: "姓名", overwrite });
    C.fillByPlaceholder("请输入手机号", p.phone, report, { label: "手机号", overwrite });
    C.fillByPlaceholder("邮箱", p.email, report, { label: "邮箱", overwrite });
    C.fillByPlaceholder("证件号码", p.idNumber, report, { label: "证件号码", overwrite });

    if (profile.settings?.allowCustomDropdowns !== false) {
      await C.chooseByPlaceholder("请选择", p.gender, report, { label: "性别", index: 0, overwrite });
      await C.chooseByPlaceholder("请选择", education[0]?.degree, report, { label: "最高学历", index: 1, overwrite });
      if (intent.desiredCities?.[0]) {
        await C.chooseByPlaceholder("选择意向工作城市", intent.desiredCities[0], report, { label: "意向工作城市", overwrite });
      }
    }

    C.fillByPlaceholder("出生日期 (年龄)", p.birthDate, report, { label: "出生日期", overwrite });
    C.fillByPlaceholder("请输入最近毕业专业", education[0]?.major, report, { label: "最近毕业专业", overwrite });
    C.fillByPlaceholder("院校所在地", education[0]?.location, report, { label: "院校所在地", overwrite });

    const schoolInputs = C.fieldsByPlaceholder("请输入就读学校");
    const majorInputs = C.fieldsByPlaceholder("请输入专业名称");
    education.forEach((item, index) => {
      if (schoolInputs[index]) {
        const result = C.setValue(schoolInputs[index], item.school, overwrite);
        if (result.ok) report.filled.push(`学校 ${index + 1}`);
      } else if (item.school) report.missing.push(`教育经历 ${index + 1} 尚未在网页添加`);
      if (majorInputs[index]) C.setValue(majorInputs[index], item.major, overwrite);
    });

    report.warnings.push("Moka 的简历上传、附件、日期级联和最终提交保留手工操作。");
    return report;
  }

  globalThis.CampusAutofillMoka = { detect, analyze, fill };
})();
