"use client";

import { useEffect, useRef, useState } from "react";

type ProxyResult = { status: number; ok: boolean; ms: number; body: unknown };

type Turn = {
  id: number;
  question: string;
  result?: ProxyResult;
  pending: boolean;
};

const ANSWER_KEYS = ["output", "answer", "text", "response", "result", "message", "content"];
const SOURCE_KEYS = ["sources", "documents", "context", "citations", "chunks"];

// n8n often wraps results in an array; unwrap single-item arrays.
function unwrap(body: unknown): unknown {
  return Array.isArray(body) && body.length === 1 ? body[0] : body;
}

function extractAnswer(body: unknown): string | null {
  const b = unwrap(body);
  if (typeof b === "string") return b;
  if (b && typeof b === "object") {
    const obj = b as Record<string, unknown>;
    for (const key of ANSWER_KEYS) {
      const v = obj[key];
      if (typeof v === "string") return v;
      if (v && typeof v === "object") {
        const nested = extractAnswer(v);
        if (nested) return nested;
      }
    }
  }
  return null;
}

function extractSources(body: unknown): unknown[] {
  const b = unwrap(body);
  if (!b || typeof b !== "object" || Array.isArray(b)) return [];
  const obj = b as Record<string, unknown>;
  for (const key of SOURCE_KEYS) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function sourceLabel(src: unknown): string {
  if (typeof src === "string") return src;
  if (src && typeof src === "object") {
    const o = src as Record<string, unknown>;
    const meta = (o.metadata ?? {}) as Record<string, unknown>;
    const title = o.title ?? o.source ?? meta.source ?? meta.title ?? o.id;
    const text = o.pageContent ?? o.content ?? o.text;
    return [title, typeof text === "string" ? text.slice(0, 300) : null]
      .filter(Boolean)
      .join(" — ");
  }
  return String(src);
}

export default function Home() {
  const [mode, setMode] = useState<"prod" | "test" | "custom">("test");
  const [customUrl, setCustomUrl] = useState("");
  const [method, setMethod] = useState<"POST" | "GET">("POST");
  const [field, setField] = useState("user_query");
  const [sessionId, setSessionId] = useState("");
  const [extra, setExtra] = useState('{"status": "testing"}');
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [showSettings, setShowSettings] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  let extraError: string | null = null;
  let extraObj: Record<string, unknown> = {};
  if (extra.trim()) {
    try {
      extraObj = JSON.parse(extra);
    } catch {
      extraError = "Extra fields must be valid JSON";
    }
  }

  async function send() {
    const q = question.trim();
    if (!q || extraError) return;
    const id = Date.now();
    setTurns((t) => [...t, { id, question: q, pending: true }]);
    setQuestion("");

    const payload = { ...extraObj, [field]: q, ...(sessionId ? { sessionId } : {}) };
    const res = await fetch("/api/rag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, url: customUrl, method, payload }),
    });
    const result = (await res.json()) as ProxyResult;
    setTurns((t) => t.map((x) => (x.id === id ? { ...x, result, pending: false } : x)));
  }

  const input =
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">RAG API Tester</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSettings((s) => !s)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              {showSettings ? "Hide" : "Show"} settings
            </button>
            <button
              onClick={() => {
                setTurns([]);
                if (sessionId) setSessionId(crypto.randomUUID());
              }}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              New session
            </button>
          </div>
        </header>

        {showSettings && (
          <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-zinc-500">Endpoint</span>
              <div className="flex gap-2">
                {(["prod", "test", "custom"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded-md px-3 py-1.5 ${
                      mode === m
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
                        : "border border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    {m === "prod" ? "Production" : m === "test" ? "Test (webhook-test)" : "Custom"}
                  </button>
                ))}
              </div>
              {mode === "custom" ? (
                <input className={input} value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} />
              ) : (
                <code className="break-all text-xs text-zinc-500">
                  Uses RAG_{mode.toUpperCase()}_URL from the server environment
                </code>
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Method</span>
              <select className={input} value={method} onChange={(e) => setMethod(e.target.value as "POST" | "GET")}>
                <option>POST</option>
                <option>GET</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Question field name</span>
              <input className={input} value={field} onChange={(e) => setField(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-zinc-500">sessionId (optional, sent only if filled)</span>
              <input className={input} value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-zinc-500">Extra body fields (JSON, optional)</span>
              <textarea
                className={`${input} font-mono`}
                rows={2}
                placeholder='{"topK": 5}'
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
              {extraError && <span className="text-red-600">{extraError}</span>}
            </label>
          </section>
        )}

        <section className="flex flex-1 flex-col gap-4">
          {turns.length === 0 && (
            <p className="py-12 text-center text-sm text-zinc-500">Ask a question to test the RAG workflow.</p>
          )}
          {turns.map((t) => (
            <TurnView key={t.id} turn={t} />
          ))}
          <div ref={bottomRef} />
        </section>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="sticky bottom-0 flex gap-2 bg-zinc-50 py-2 dark:bg-black"
        >
          <textarea
            className={`${input} resize-none`}
            rows={2}
            placeholder="Ask something… (Enter to send, Shift+Enter for newline)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            type="submit"
            disabled={!question.trim() || !!extraError}
            className="rounded-md bg-zinc-900 px-5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-black"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const { result } = turn;
  const answer = result ? extractAnswer(result.body) : null;
  const sources = result ? extractSources(result.body) : [];

  return (
    <div className="flex flex-col gap-2">
      <div className="self-end max-w-[85%] whitespace-pre-wrap rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-black">
        {turn.question}
      </div>
      <div className="max-w-[95%] rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
        {turn.pending ? (
          <span className="animate-pulse text-zinc-500">Waiting for response…</span>
        ) : result ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 text-xs">
              <span className={result.ok ? "text-green-600" : "text-red-600"}>
                {result.status === 0 ? "Network error" : `HTTP ${result.status}`}
              </span>
              <span className="text-zinc-500">{result.ms} ms</span>
            </div>
            {answer ? (
              <div className="whitespace-pre-wrap leading-6">{answer}</div>
            ) : (
              <div className="text-zinc-500">No answer field detected — see raw response below.</div>
            )}
            {sources.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-500">Sources ({sources.length})</span>
                <ol className="list-decimal pl-5 text-xs text-zinc-600 dark:text-zinc-400">
                  {sources.map((s, i) => (
                    <li key={i}>{sourceLabel(s)}</li>
                  ))}
                </ol>
              </div>
            )}
            <details>
              <summary className="cursor-pointer text-xs text-zinc-500">Raw response</summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded bg-zinc-100 p-3 font-mono text-xs dark:bg-zinc-900">
                {typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}
      </div>
    </div>
  );
}
