export type GeminiProxyRequest = {
  contents: unknown[];
};

export async function proxyJsonRequest(endpoint: string, apiKey: string, payload: GeminiProxyRequest) {
  const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get('content-type') || 'application/json'
  };
}
