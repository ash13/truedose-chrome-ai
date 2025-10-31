// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "factCheckSelection",
    title: "Verify this claim",
    contexts: ["selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "factCheckSelection") {
    // Store the selected text
    chrome.storage.local.set({ selectedText: info.selectionText });
    // Open the popup
    chrome.action.openPopup();
    // Store the selected text and a one-time flag to auto-run the search
    chrome.storage.local.set(
      { selectedText: info.selectionText, runSearchOnOpen: true },
      () => {
        chrome.action.openPopup();
      }
    );
  }
});