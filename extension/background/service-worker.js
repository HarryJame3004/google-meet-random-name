/**
 * Meet Random Picker - Background Service Worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set initial default settings
    chrome.storage.local.set({
      settings: {
        soundEnabled: true,
        animationEnabled: true,
        excludeHost: true,
        showWidget: true,
        autoSync: true,
        debugMode: false,
      },
    });
    console.log('[MeetRandom] Extension installed successfully.');
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('meet.google.com')) return;

  if (command === 'random-pick') {
    chrome.tabs.sendMessage(tab.id, { action: 'TRIGGER_RANDOM_PICK' });
  } else if (command === 'toggle-widget') {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_WIDGET' });
  }
});
