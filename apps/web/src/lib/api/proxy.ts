export const GEMINI_PROXY_PATH = '/api/proxy-gemini';

export type GeminiProxyRequest = {
  contents: unknown[];
};

export type GeminiProxyResult = {
  ok: boolean;
  status: number;
  body: string;
  contentType: string;
};

export async function submitGeminiProxy(payload: GeminiProxyRequest): Promise<GeminiProxyResult> {
  const response = await fetch(GEMINI_PROXY_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return {
    ok: response.ok,
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get('content-type') || 'application/json'
  };
}
