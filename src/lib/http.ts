export const USER_AGENT =
  "Northlist/1.0 (student project; public company directory and public job posts only)";

export interface FetchResult {
  url: string;
  status: number;
  text: string;
  contentType: string;
}

const tails = new Map<string, Promise<void>>();
const nextAt = new Map<string, number>();

const HOST_GAP_MS: Record<string, number> = {
  "startup100.net": 160,
  "www.startup100.net": 160,
  "boards-api.greenhouse.io": 140,
  "api.lever.co": 140,
  "api.ashbyhq.com": 140,
  "apply.workable.com": 140,
  "api.smartrecruiters.com": 140,
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pace(hostname: string, gapMs: number): Promise<void> {
  const previous = tails.get(hostname) ?? Promise.resolve();
  const current = previous.then(async () => {
    const now = Date.now();
    const at = nextAt.get(hostname) ?? now;
    const wait = Math.max(0, at - now);
    nextAt.set(hostname, Math.max(at, now) + gapMs);
    if (wait) await sleep(wait);
  });
  tails.set(hostname, current);
  return current;
}

export async function fetchText(
  url: string,
  options: { timeout?: number; maxBytes?: number; accept?: string } = {},
): Promise<FetchResult | null> {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  const gap = HOST_GAP_MS[hostname];
  if (gap) await pace(hostname, gap);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout ?? 9000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: options.accept ?? "text/html,application/json,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en,fi;q=0.8",
      },
    });
    const text = await readLimited(response, options.maxBytes ?? 400_000);
    return {
      url: response.url,
      status: response.status,
      text,
      contentType: response.headers.get("content-type") ?? "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    received += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const buffer = new Uint8Array(Math.min(received, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, buffer.length - offset);
    if (take <= 0) break;
    buffer.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return new TextDecoder().decode(buffer);
}
