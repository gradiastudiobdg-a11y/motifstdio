import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.studio/vendor/flow-go/flow-go');
async function replace(file, before, after) {
  const filename = path.join(root, file), text = (await fs.readFile(filename, 'utf8')).replace(/\r\n/g, '\n');
  if (text.includes(after)) return;
  if (!text.includes(before)) throw Error(`Upstream changed: ${file}; inspect before patching.`);
  await fs.writeFile(filename, text.replace(before, after));
}
await replace('internal/cli/cli.go', 'const bridgeAttachWindow = 5 * time.Second', 'const bridgeAttachWindow = 45 * time.Second');
await replace('internal/cli/doctor.go', 'const doctorAttachWindow = 3 * time.Second', 'const doctorAttachWindow = 35 * time.Second');
await replace('internal/recaptcha/recaptcha.go', 'providers = append(providers, NewHTTP(hc, "", "").WithUserAgent(userAgent), EmptyProvider{})', '// MOTIF: broker mode must stop if the real browser cannot provide a token. No HTTP fallback.');
// The caller must retain the outcome even on failure so no accepted media IDs are lost.
await replace('internal/cli/cli.go', 'if err != nil {\n\t\treturn fail(err)\n\t}\n\tprintJSON(outcome)', 'if err != nil {\n\t\tif outcome != nil { printJSON(outcome) }\n\t\treturn fail(err)\n\t}\n\tprintJSON(outcome)');
await replace('internal/recaptcha/recaptcha_test.go', 'if !sawHTTP {\n\t\tt.Error("the transport must stay behind the page providers as a fallback")', 'if sawHTTP {\n\t\tt.Error("MOTIF broker mode must not have an HTTP fallback")');
await replace('internal/recaptcha/useragent_test.go', '[]string{"http", "", "auto", "broker"}', '[]string{"http", "", "auto"}');
console.log('Flow-go patches applied: longer browser attach, strict browser broker, retained failure receipt.');
