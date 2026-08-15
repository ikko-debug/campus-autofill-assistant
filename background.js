const PROFILE_KEY = "campusAutofillProfile";

async function installDefaultProfile() {
  const existing = await chrome.storage.local.get(PROFILE_KEY);
  if (existing[PROFILE_KEY]) return;

  const response = await fetch(chrome.runtime.getURL("data/default-profile.json"));
  const profile = await response.json();
  await chrome.storage.local.set({ [PROFILE_KEY]: profile });
}

chrome.runtime.onInstalled.addListener(() => {
  installDefaultProfile().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  installDefaultProfile().catch(() => {});
});
