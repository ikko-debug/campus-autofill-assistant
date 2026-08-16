const PROFILE_KEY = "campusAutofillProfile";
importScripts("profile.js");

async function installDefaultProfile() {
  const existing = await chrome.storage.local.get(PROFILE_KEY);
  const response = await fetch(chrome.runtime.getURL("data/default-profile.json"));
  const defaults = await response.json();
  const profile = existing[PROFILE_KEY]
    ? CampusAutofillProfile.normalize(existing[PROFILE_KEY], defaults)
    : defaults;
  await chrome.storage.local.set({ [PROFILE_KEY]: profile });
}

chrome.runtime.onInstalled.addListener(() => {
  installDefaultProfile().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  installDefaultProfile().catch(() => {});
});
