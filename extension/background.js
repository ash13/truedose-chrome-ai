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
    // Store the selected text and open popup
    // User must manually select language and click button to start search
    chrome.storage.local.set(
      { selectedText: info.selectionText },
      () => {
        chrome.action.openPopup();
      }
    );
  }
});