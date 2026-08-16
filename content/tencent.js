(function () {
  "use strict";
  const C = globalThis.CampusAutofill;

  function detect() {
    return location.hostname === "join.qq.com" && location.pathname.endsWith("resumeedit.html");
  }

  function analyze() {
    return {
      adapter: "腾讯校招",
      supported: detect(),
      fields: document.querySelectorAll("input, textarea").length,
      note: "支持当前已经展开的教育、实习、项目和获奖区块；不会自动删除经历或提交简历。"
    };
  }

  function recordContainers(kind) {
    if (kind === "education") {
      return [...document.querySelectorAll('.educationBox .info_list')].filter((element) =>
        element.querySelector('input[placeholder="请输入学校名称"]')
      );
    }
    const patterns = {
      internships: /实习经历-\d+/,
      projects: /项目经历-\d+/,
      awards: /获奖信息-\d+/
    };
    return [...document.querySelectorAll(".info_list")].filter((element) => patterns[kind].test(element.innerText || ""));
  }

  function fillInRecord(root, placeholder, value, report, label, overwrite) {
    return C.fillByPlaceholder(placeholder, value, report, { root, label, overwrite });
  }

  function exactDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : "";
  }

  function setCurrent(root, current, report, label) {
    if (!current) return;
    const checkbox = [...root.querySelectorAll('input[type="checkbox"]')].find((input) =>
      (input.closest("label")?.innerText || input.parentElement?.parentElement?.innerText || "").includes("至今")
    );
    if (!checkbox || checkbox.checked) return;
    checkbox.closest("label")?.click();
    report.filled.push(label);
  }

  async function fill(profile, options = {}) {
    const report = C.createReport("腾讯校招");
    const overwrite = Boolean(options.overwrite);
    const p = profile.personal || {};
    const intent = profile.intent || {};
    const contacts = profile.contacts || {};
    const education = profile.education || [];
    const internships = profile.internships || [];
    const projects = profile.projects || [];
    const awards = profile.awards || [];

    const simple = [
      ["请输入姓名", p.name, "姓名"],
      ["请填写您的手机号码", p.phone, "手机号"],
      ["请输入邮箱地址", p.email, "邮箱"],
      ["请选择当前所处地", p.currentLocation, "当前所在地"],
      ["请输入微信号", p.wechat, "微信号"],
      ["请输入QQ号", p.qq, "QQ号"],
      ["请输入紧急联系人姓名", contacts.emergencyName, "紧急联系人"],
      ["请输入紧急联系人电话", contacts.emergencyPhone, "紧急联系人电话"],
      ["请输入面试城市", intent.interviewCity, "面试城市"],
      ["请输入个人主页超链接", p.website, "个人主页"],
      ["请输入资料证明人", contacts.referenceName, "资料证明人"],
      ["请输入证明人身份", contacts.referenceRole, "证明人身份"],
      ["请输入证明人联系电话", contacts.referencePhone, "证明人电话"],
      ["请填写具体工具名称&模型名称与版本号，如 Cursor、Copilot、Coze、Claude 、Claude 4.6 Sonnet、GPT-5.5、DeepSeek-V4 等", profile.additional?.aiTools, "AI 工具"],
      ["请说明项目目标背景、AI 工具及模型的选择及原因、你与 AI 的分工、核心挑战及解决方案、项目结果等", profile.additional?.aiProject, "AI 协作项目"],
      ["请输入相关项目或作品链接", profile.additional?.portfolioLink, "作品链接"]
    ];
    simple.forEach(([placeholder, value, label]) => C.fillByPlaceholder(placeholder, value, report, { label, overwrite }));

    const educationContainers = recordContainers("education");
    educationContainers.forEach((root, index) => {
      const item = education[index];
      if (!item) return;
      const prefix = `教育 ${index + 1}`;
      fillInRecord(root, "请输入学校名称", item.school, report, `${prefix} 学校`, overwrite);
      fillInRecord(root, "请输入院系", item.department, report, `${prefix} 院系`, overwrite);
      fillInRecord(root, "请输入专业", item.major, report, `${prefix} 专业`, overwrite);
      fillInRecord(root, "请输入你的绩点", item.gpa, report, `${prefix} GPA`, overwrite);
      fillInRecord(root, "请输入你所在院校的满绩绩点", item.gpaBase, report, `${prefix} 满绩`, overwrite);
      fillInRecord(root, "请输入导师", item.advisor, report, `${prefix} 导师`, overwrite);
      fillInRecord(root, "请输入实验室", item.laboratory, report, `${prefix} 实验室`, overwrite);
      fillInRecord(root, "请输入研究方向", item.research, report, `${prefix} 研究方向`, overwrite);
      fillInRecord(root, "请输入已发表论文，如未发表则无需填写", item.paper, report, `${prefix} 论文`, overwrite);
      const dates = C.fieldsByPlaceholder("选择日期", root);
      if (exactDate(item.startDate) && dates[0]) C.setValue(dates[0], item.startDate, overwrite);
      if (exactDate(item.endDate) && dates[1]) C.setValue(dates[1], item.endDate, overwrite);
    });
    education.slice(educationContainers.length).forEach((_item, index) => report.missing.push(`教育 ${educationContainers.length + index + 1} 尚未在网页添加`));

    const internshipContainers = recordContainers("internships");
    const internshipMatches = C.matchRecordsToRoots(
      internships,
      internshipContainers,
      (root) => C.fieldsByPlaceholder("请输入实习公司", root)[0]?.value,
      (record) => record.company
    );
    internshipMatches.matches.forEach(({ root, record: item, recordIndex: index }) => {
      if (!item) return;
      const prefix = `实习 ${index + 1}`;
      fillInRecord(root, "请输入实习公司", item.company, report, `${prefix} 公司`, overwrite);
      fillInRecord(root, "请输入职位", item.role, report, `${prefix} 职位`, overwrite);
      fillInRecord(root, "请输入描述内容", item.description, report, `${prefix} 描述`, overwrite);
      const dates = C.fieldsByPlaceholder("选择日期", root);
      if (exactDate(item.startDate) && dates[0]) C.setValue(dates[0], item.startDate, overwrite);
      if (exactDate(item.endDate) && dates[1]) C.setValue(dates[1], item.endDate, overwrite);
      setCurrent(root, item.current, report, `${prefix} 至今`);
    });
    internshipMatches.unmatchedRecordIndexes.forEach((index) => report.missing.push(`实习 ${index + 1} 尚未在网页添加或无法按公司匹配`));

    const projectContainers = recordContainers("projects");
    const projectMatches = C.matchRecordsToRoots(
      projects,
      projectContainers,
      (root) => C.fieldsByPlaceholder("请输入项目名称（含校园实践）", root)[0]?.value,
      (record) => record.name
    );
    projectMatches.matches.forEach(({ root, record: item, recordIndex: index }) => {
      if (!item) return;
      const prefix = `项目 ${index + 1}`;
      fillInRecord(root, "请输入项目名称（含校园实践）", item.name, report, `${prefix} 名称`, overwrite);
      fillInRecord(root, "请输入在项目中担任的角色", item.role, report, `${prefix} 角色`, overwrite);
      fillInRecord(root, "请输入描述内容", item.description, report, `${prefix} 描述`, overwrite);
      const dates = C.fieldsByPlaceholder("选择日期", root);
      if (exactDate(item.startDate) && dates[0]) C.setValue(dates[0], item.startDate, overwrite);
      if (exactDate(item.endDate) && dates[1]) C.setValue(dates[1], item.endDate, overwrite);
      setCurrent(root, item.current, report, `${prefix} 至今`);
    });
    projectMatches.unmatchedRecordIndexes.forEach((index) => report.missing.push(`项目 ${index + 1} 尚未在网页添加或无法按名称匹配`));

    const awardContainers = recordContainers("awards");
    awardContainers.forEach((root, index) => {
      const item = awards[index];
      if (!item) return;
      const prefix = `获奖 ${index + 1}`;
      fillInRecord(root, "请输入奖项名称", item.name, report, `${prefix} 名称`, overwrite);
      fillInRecord(root, "请输入奖项说明", item.description, report, `${prefix} 说明`, overwrite);
      fillInRecord(root, "请选择获奖时间", item.year, report, `${prefix} 年份`, overwrite);
    });
    awards.slice(awardContainers.length).forEach((_item, index) => report.missing.push(`获奖 ${awardContainers.length + index + 1} 尚未在网页添加`));

    if (profile.settings?.allowCustomDropdowns !== false) {
      await C.chooseByPlaceholder("请选择您的国家/地区", "中国", report, { label: "国家/地区", overwrite });
      if (intent.businessGroup) await C.chooseByPlaceholder("请选择感兴趣的事业群", intent.businessGroup, report, { label: "事业群", overwrite });
      const educationRoots = educationContainers;
      for (let i = 0; i < Math.min(education.length, educationRoots.length); i += 1) {
        await C.chooseByPlaceholder("请选择学历", education[i].degree, report, { root: educationRoots[i], label: `学历 ${i + 1}`, overwrite });
      }
    }

    report.warnings.push("腾讯的证件号可能在首次提交后锁定；插件不会尝试修改禁用字段。");
    report.warnings.push("简历只提供到月份的日期不会自动补成具体某日；请在设置页补全 YYYY-MM-DD，或在网页手工选择。");
    report.warnings.push("地区级联、多选城市、附件上传和最终提交暂保留手工确认。");
    return report;
  }

  globalThis.CampusAutofillTencent = { detect, analyze, fill };
})();
