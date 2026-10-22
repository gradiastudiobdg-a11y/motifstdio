# Google Flow MCP compatibility

`google-flow-mcp-reference.patch` applies to [RohaanA/google-flow-mcp](https://github.com/RohaanA/google-flow-mcp), MIT, commit `a357dc36b8b9c2e8c85c809e4d80210149652fd0`.

It adds Indonesian composer labels and price text, detects manual mode using the visible settings trigger, closes an existing Agent panel before selecting manual generation, adds a read-only control diagnostic MCP tool, and removes the AutomationControlled browser flag. It does not retry failed generations or replace the UI generation path with an API request.

The patch also provides a privacy-preserving browser/login classification tool, prefers an existing project tab when attaching over CDP, and disables QUIC for local network compatibility. Authentication for the web studio is handled by the original authorized session broker; no stealth sign-in or CAPTCHA handling is added.

After `git apply <absolute-patch-path>`, run `npm ci` and `npm test` inside the clone. The clone stays under `studio/.studio/vendor/google-flow-mcp-reference`. Run `node --test automation/tests/flow-quoted-ui.test.mjs` from `studio` for the isolated local DOM fixture. That fixture is not a live Flow test.
