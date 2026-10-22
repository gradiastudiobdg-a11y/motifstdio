import { inspectFlowAgent } from '../automation/flow-agent-inspect.mjs';
try { const report = await inspectFlowAgent(); delete report.models; console.log(JSON.stringify(report, null, 2)); }
catch (error) { console.error(String(error.message).replace(/https?:\S+/g, '[url]')); process.exitCode = 1; }
