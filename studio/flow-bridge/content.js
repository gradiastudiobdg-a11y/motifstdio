// The module runs in the extension's isolated world. Page scripts never receive the pair token.
void import(chrome.runtime.getURL('runner.mjs'));
