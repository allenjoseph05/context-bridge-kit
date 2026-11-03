// Service worker: opens the side panel on action click. Stateless; it does not touch the native
// port (the panel owns it; decisions.md, T08). Context menu and adapter injection arrive in T12.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e: unknown) => console.error("context-bridge: setPanelBehavior failed", e));

export {};
