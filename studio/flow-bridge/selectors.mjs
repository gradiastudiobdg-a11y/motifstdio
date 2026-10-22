// Original semantic adapter. No signed-in Flow DOM has been verified yet.
export const ADAPTER_VERSION = 'flow-semantic-2026-10-19-v2';
export const UI = Object.freeze({
  prompt: 'textarea:not([disabled]), [contenteditable="true"][role="textbox"], [contenteditable="true"][data-lexical-editor="true"]',
  controls: 'button, [role="button"], select, input',
  cards: 'article, [role="listitem"], [data-generation-id], [data-testid="generation-card"]',
  generate: /^(?:generate(?:\s+(?:video|image))?|buat(?:\s+video)?|hasilkan)(?:\s*[·:—-]?\s*\d+(?:[.,]\d+)?\s*(?:credits?|kredit))?$/i,
  login: /^(?:sign in|log in|masuk|login)(?:\s+with google)?$/i,
  captcha: /verify (?:you are|you're) human|unusual activity|verifikasi.+manusia|complete the captcha/i,
  settingNames: {
    mode: /generation (?:type|mode)|media type|jenis generasi|mode generasi/i,
    aspect: /aspect(?: ratio)?|rasio(?: aspek)?|orientation|orientasi/i,
    duration: /duration|length|durasi|panjang/i,
    outputs: /(?:number of )?outputs?|results?|jumlah(?: hasil)?/i,
    model: /model/i,
  },
  values: {
    mode: /^(?:video|text to video|teks ke video)$/i,
    aspect: /^(?:9\s*:\s*16|portrait(?:\s*\(9:16\))?|vertical(?:\s*\(9:16\))?|vertikal)$/i,
    outputs: /^(?:1|1 output|1 result|1 hasil|x1|1x)$/i,
  },
  supportedModel: /(?:veo\s*3\.1(?:\s*[-–]?\s*(?:lite|fast|quality))?|(?:gemini\s*)?omni\s*flash(?:\s*1\.1)?)/i,
});
