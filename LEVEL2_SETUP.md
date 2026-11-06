# Level 2 AI — setup and launch guide

Level 1 remains available at https://ozzie-ai.github.io/contractor-office-pro-site/?v=54&lang=es

Level 2 test interface: https://ozzie-ai.github.io/contractor-office-pro-site/level2.html

## What has been built
- `api/interpret.js`: Vercel serverless endpoint using OpenAI Responses API and strict JSON schema. It organizes Spanish/English contractor dictation into work items, quantities, exclusions, future work and unknowns. It does NOT produce prices.
- `level2.html`: contractor test page that calls a configured backend, shows Spanish and English results, and never includes the OpenAI API key.
- Existing `tests/scenarios.json`: human-grounded examples for evaluation. Current Level 1 tests still protect existing estimators.

## One-time owner setup — required before real AI calls work

1. Create or sign into Vercel at https://vercel.com, choose **Add New Project**, and import the existing GitHub repository `ozzie-ai/contractor-office-pro-site`.
2. Choose a static/Other framework preset if prompted. Keep **Root Directory** at the repository root. The `api/interpret.js` function is expected at the deployment's `/api/interpret` path. If asked for a build command, leave it empty; no build is needed.
3. In Vercel Project → Settings → Environment Variables, add:
   - `OPENAI_API_KEY` = a private key from your OpenAI API account (not a ChatGPT login or subscription).
   - `COP_BETA_TOKEN` = your own long, random private beta access code for invited testers.
   - `OPENAI_MODEL` = `gpt-4o-mini` (optional; configured default).
4. Deploy or redeploy after adding environment variables. Copy your Vercel site's URL, adding `/api/interpret`.
5. Open the GitHub Pages Level 2 test interface. Paste the Vercel API URL and your **beta access code** (never the OpenAI API key), select an example, and press Interpretar con IA.

## Safety and product boundaries
- Never paste `OPENAI_API_KEY` into the static website, GitHub commits, or chat. Only add it in Vercel secret environment variables.
- The browser does not persist the beta token. This is a controlled *pilot*, not a public authenticated product.
- Server requests use `store:false` and do not include contractor transcript in error responses. Consult the model provider's privacy terms for data processing.
- A shared beta token is NOT production-grade authentication or a rate limiter. Before a paid public launch, add real user authentication, abuse prevention, per-user rate limits, metering and usage quotas to control API costs.
- The AI interprets work; our pricing engine still needs accurate prices and an integration layer before Level 2 can generate the final priced proposal.
- The current static GitHub Pages host cannot execute the private AI API itself. Vercel runs the backend independently.

## Validation
- Check the API's response on existing MIXED-001 and MIXED-002 scenarios and compare every detail to `tests/scenarios.json`.
- Review the result before pricing; do not merge different amperage ratings or invent missing material quantities.
- The Level 2 test page does not silently replace the Level 1 estimating workflow until these integration checks pass.
