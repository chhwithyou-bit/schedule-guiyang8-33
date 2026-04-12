export type ProxyNodeRecord = {
  id: string;
  name: string;
  raw: string;
  protocol: string;
  source_id?: string | null;
  source_label?: string | null;
};

export type NodeSourceRecord = {
  id: string;
  source_type: string;
  label: string;
  source_url?: string | null;
  source_content?: string | null;
  enabled: boolean;
  node_count: number;
  last_error?: string | null;
  updated_at: string;
};

function safeDecodeUrlComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseNodes(rawText: string): ProxyNodeRecord[] {
  return String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(ss|vmess|trojan|vless|ssr):\/\//.test(line))
    .map((raw, index) => {
      const protocol = raw.split('://')[0] || 'unknown';
      const label = raw.includes('#') ? safeDecodeUrlComponent(raw.split('#').pop() || '') : `${protocol.toUpperCase()}节点`;
      return {
        id: `${protocol}-${index + 1}`,
        name: label || `${protocol.toUpperCase()}节点`,
        raw,
        protocol,
        source_id: null,
        source_label: null
      };
    });
}

export function buildClientLaunchLinks(subscriptionUrl: string) {
  const encoded = encodeURIComponent(subscriptionUrl);
  return {
    shadowrocket: `shadowrocket://add/sub://${encoded}`,
    clash: subscriptionUrl,
    surge: subscriptionUrl,
    loon: subscriptionUrl,
    stash: subscriptionUrl,
    quantumult_x: subscriptionUrl,
    sing_box: subscriptionUrl,
    v2rayn: subscriptionUrl,
    v2rayng: subscriptionUrl
  };
}

export function buildNodesPayload(baseUrl: string, password: string, nodes: ProxyNodeRecord[], sources: NodeSourceRecord[]) {
  const subscription_url = `${baseUrl.replace(/\/$/, '')}/api/nodes/subscription?pwd=${encodeURIComponent(password)}`;
  return {
    ok: true,
    nodes,
    sources,
    subscription_url,
    raw: nodes.map((node) => node.raw).join('\n'),
    clients: buildClientLaunchLinks(subscription_url)
  };
}
