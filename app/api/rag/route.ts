// Webhook URLs live in env vars (see .env.example) so they never reach the client or the repo.
const ENDPOINTS = {
  prod: process.env.RAG_PROD_URL,
  test: process.env.RAG_TEST_URL,
};

type ProxyRequest = {
  mode?: "prod" | "test" | "custom";
  url?: string;
  method?: "GET" | "POST";
  payload?: Record<string, unknown>;
};

// Proxies the call server-side so the browser doesn't hit CORS on the n8n webhook.
export async function POST(request: Request) {
  const { mode = "prod", url: customUrl, method = "POST", payload = {} } =
    (await request.json()) as ProxyRequest;

  const url = mode === "custom" ? customUrl : ENDPOINTS[mode];
  if (!url) {
    const error = mode === "custom" ? "Custom URL is required" : `RAG_${mode.toUpperCase()}_URL is not set`;
    return Response.json({ status: 0, ok: false, ms: 0, body: { error } });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return Response.json({ error: `Invalid URL: ${url}` }, { status: 400 });
  }

  const init: RequestInit = { method, headers: {} };
  if (method === "GET") {
    for (const [key, value] of Object.entries(payload)) {
      target.searchParams.set(key, String(value));
    }
  } else {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(payload);
  }

  const started = Date.now();
  try {
    const res = await fetch(target, init);
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Non-JSON response; return as plain text.
    }
    return Response.json({
      status: res.status,
      ok: res.ok,
      ms: Date.now() - started,
      body,
    });
  } catch (err) {
    return Response.json({
      status: 0,
      ok: false,
      ms: Date.now() - started,
      body: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}
