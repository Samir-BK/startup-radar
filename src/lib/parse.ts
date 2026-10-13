import type { BoardRef, Company, CompanyStatus, JobSource } from "./types";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

export function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const code = Number(digits);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&([a-z]+|#39);/gi, (entity, name: string) => {
      return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
    });
}

export function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const LEGAL_SUFFIX =
  /\b(oyj|oy|ab|ltd|limited|inc|incorporated|gmbh|llc|corp|corporation|plc)\b/g;

export function normalizeName(value: string): string {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(companyName: string, boardName: string | null): boolean {
  if (!boardName) return false;
  const left = normalizeName(companyName);
  const right = normalizeName(boardName);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (shorter.length >= 4 && longer.includes(shorter)) return true;
  const leftTokens = new Set(left.split(" ").filter((token) => token.length >= 5));
  return right
    .split(" ")
    .some((token) => token.length >= 5 && leftTokens.has(token));
}

export interface DirectoryEntry {
  slug: string;
  name: string;
}

export function parseDirectory(html: string): DirectoryEntry[] {
  const entries: DirectoryEntry[] = [];
  const pattern = /<li><a href="\/company\/([^"]+)">([^<]+)<\/a><\/li>/g;
  for (const match of html.matchAll(pattern)) {
    const slug = decodeHtml(match[1]).trim();
    const name = decodeHtml(match[2]).trim();
    if (slug && name) entries.push({ slug, name });
  }
  return entries;
}

export function parseCompanyPage(
  html: string,
  fallback: DirectoryEntry,
): Omit<
  Company,
  | "careersUrl"
  | "jobSource"
  | "scanStatus"
  | "detail"
  | "profiledAt"
  | "scannedAt"
> {
  const section = html.split('id="company-data"')[1]?.split("<footer")[0] ?? "";
  const name =
    decodeHtml(
      html.match(/<div class="col-lg-8">\s*<h1>([^<]+)<\/h1>/)?.[1] ?? fallback.name,
    ).trim() || fallback.name;
  const founded = cleanField(section.match(/Founded:\s*<span class="bold">([^<]*)</)?.[1]);
  const category = cleanField(section.match(/Category:\s*<span class="bold">([^<]*)</)?.[1]);
  const city = cleanField(section.match(/City:\s*<span class="bold">([^<]*)</)?.[1]);
  const website = section.match(/<p class="website">\s*<a href="([^"]+)"/)?.[1] ?? null;
  const blurbMatch = section.match(
    /<div\s*>\s*([\s\S]*?)\s*<\/div>\s*(?:<p class="website">|<p>\s*(?:<a |$))/,
  );
  let blurb = blurbMatch ? stripTags(blurbMatch[1]) : "";
  if (!blurb || blurb.startsWith("(function") || blurb.length < 12) blurb = "";
  if (blurb.length > 180) blurb = `${blurb.slice(0, 177).trimEnd()}…`;

  let status: CompanyStatus = "active";
  if (/<span class="bold">\s*Deceased/i.test(section)) status = "deceased";
  else if (/<span class="bold">\s*Exited/i.test(section)) status = "exited";
  else if (/older than 10 years/i.test(section)) status = "established";

  return {
    slug: fallback.slug,
    name,
    profileUrl: `https://startup100.net/company/${fallback.slug}`,
    website: website ? decodeHtml(website) : null,
    city,
    category,
    founded,
    status,
    blurb: blurb || null,
  };
}

function cleanField(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = decodeHtml(value).replace(/\s+/g, " ").trim();
  return cleaned || null;
}

export function parseRobotsDisallow(text: string): string[] {
  const groups: { agents: string[]; disallow: string[] }[] = [];
  let agents: string[] = [];
  let disallow: string[] = [];
  let sawRule = false;

  const flush = () => {
    if (agents.length > 0) groups.push({ agents, disallow });
    agents = [];
    disallow = [];
    sawRule = false;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const splitAt = line.indexOf(":");
    if (splitAt < 0) continue;
    const key = line.slice(0, splitAt).trim().toLowerCase();
    const value = line.slice(splitAt + 1).trim();
    if (key === "user-agent") {
      if (sawRule) flush();
      agents.push(value.toLowerCase());
    } else if (key === "disallow") {
      sawRule = true;
      disallow.push(value);
    } else if (key === "allow" || key === "sitemap" || key === "crawl-delay") {
      sawRule = true;
    }
  }
  flush();

  return groups.find((group) => group.agents.includes("*"))?.disallow ?? [];
}

export function pathAllowed(disallow: string[], url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname || "/";
  } catch {
    return false;
  }
  for (const rule of disallow) {
    if (!rule) continue;
    if (rule === "/") return false;
    if (path.startsWith(rule)) return false;
  }
  return true;
}

const SOCIAL_HOST =
  /(^|\.)(facebook|twitter|x|linkedin|instagram|youtube|tiktok|crunchbase|angel)\.(com|co)$/i;

export function cleanUrl(raw: string): string {
  return raw.replace(/\\+/g, "").replace(/[),.;]+$/, "");
}

export function urlsInText(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const url = cleanUrl(match[0]);
    if (url && !found.includes(url)) found.push(url);
  }
  return found;
}

const CAREER_HINT =
  /career|jobs|join-us|joinus|openings|vacancies|rekry|tyopaikat|työpaikat|tyopaikka|open-position|work-with-us|avoimet|come-work|tule-toihin/i;

const ATS_HINT =
  /greenhouse\.io|lever\.co|ashbyhq\.com|teamtailor\.com|workable\.com|recruitee\.com|personio\.(de|com)|smartrecruiters\.com/i;

export function careerLinks(html: string, baseUrl: string): string[] {
  const found: string[] = [];
  const push = (raw: string) => {
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) {
      return;
    }
    let absolute: string;
    try {
      absolute = cleanUrl(new URL(raw, baseUrl).toString());
    } catch {
      return;
    }
    let host = "";
    try {
      host = new URL(absolute).hostname;
    } catch {
      return;
    }
    if (SOCIAL_HOST.test(host)) return;
    const interesting = CAREER_HINT.test(absolute) || ATS_HINT.test(absolute) || detectBoard(absolute);
    if (!interesting) return;
    if (!found.includes(absolute)) found.push(absolute);
  };

  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) push(match[1]);
  for (const url of urlsInText(html)) {
    if (CAREER_HINT.test(url) || ATS_HINT.test(url)) push(url);
  }
  return found;
}

export function detectBoard(raw: string): BoardRef | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const first = parts[0]?.toLowerCase() ?? "";

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    const token = first === "embed" ? url.searchParams.get("for") : first;
    return token ? greenhouseRef(token, raw) : null;
  }
  if (host.endsWith("greenhouse.io")) {
    const token = url.searchParams.get("for");
    return token ? greenhouseRef(token, raw) : null;
  }
  if (host === "jobs.lever.co" && first) return leverRef(first, raw);
  if (host === "jobs.ashbyhq.com" && first && first !== "form") return ashbyRef(first, raw);
  if (host === "apply.workable.com" && first && !["api", "assets", "j"].includes(first)) {
    return workableRef(first, raw);
  }
  if (host.endsWith(".teamtailor.com")) {
    const token = host.slice(0, -".teamtailor.com".length);
    if (token && !token.includes(".")) return teamtailorRef(token, raw);
  }
  if (host.endsWith(".recruitee.com")) {
    const token = host.slice(0, -".recruitee.com".length);
    if (token && !token.includes(".")) return recruiteeRef(token, raw);
  }
  if (host.endsWith(".jobs.personio.de") || host.endsWith(".jobs.personio.com")) {
    const token = host.split(".")[0];
    if (token) return personioRef(token, host.endsWith(".com") ? "com" : "de", raw);
  }
  if (
    (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") &&
    first
  ) {
    return smartrecruitersRef(parts[0], raw);
  }
  return null;
}

export function boardsInHtml(html: string): BoardRef[] {
  const refs: BoardRef[] = [];
  const seen = new Set<string>();
  const remember = (ref: BoardRef | null) => {
    if (!ref) return;
    const key = `${ref.source}:${ref.token.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  };
  for (const match of html.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    remember(detectBoard(cleanUrl(match[0])));
  }
  for (const match of html.matchAll(/[?&]for=([a-z0-9_-]+)/gi)) {
    remember(greenhouseRef(match[1], `https://boards.greenhouse.io/${match[1]}`));
  }
  return refs;
}

function greenhouseRef(token: string, pageUrl: string): BoardRef {
  return {
    source: "greenhouse",
    token,
    jobsUrl: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`,
    pageUrl,
  };
}

function leverRef(token: string, pageUrl: string): BoardRef {
  return {
    source: "lever",
    token,
    jobsUrl: `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
    pageUrl,
  };
}

function ashbyRef(token: string, pageUrl: string): BoardRef {
  return {
    source: "ashby",
    token,
    jobsUrl: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`,
    pageUrl,
  };
}

function workableRef(token: string, pageUrl: string): BoardRef {
  return {
    source: "workable",
    token,
    jobsUrl: `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}`,
    pageUrl,
  };
}

function teamtailorRef(token: string, pageUrl: string): BoardRef {
  return {
    source: "teamtailor",
    token,
    jobsUrl: `https://${token}.teamtailor.com/jobs.json`,
    pageUrl,
  };
}

function recruiteeRef(token: string, pageUrl: string): BoardRef {
  return {
    source: "recruitee",
    token,
    jobsUrl: `https://${token}.recruitee.com/api/offers/`,
    pageUrl,
  };
}

function personioRef(token: string, tld: "de" | "com", pageUrl: string): BoardRef {
  return {
    source: "personio",
    token,
    jobsUrl: `https://${token}.jobs.personio.${tld}/xml?language=en`,
    pageUrl,
  };
}

function smartrecruitersRef(token: string, pageUrl: string): BoardRef {
  return {
    source: "smartrecruiters",
    token,
    jobsUrl: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100`,
    pageUrl,
  };
}

export function guessBoard(source: JobSource, token: string): BoardRef | null {
  if (!/^[a-z0-9][a-z0-9-]{2,58}[a-z0-9]$/.test(token)) return null;
  switch (source) {
    case "greenhouse":
      return greenhouseRef(token, `https://job-boards.greenhouse.io/${token}`);
    case "lever":
      return leverRef(token, `https://jobs.lever.co/${token}`);
    case "ashby":
      return ashbyRef(token, `https://jobs.ashbyhq.com/${token}`);
    case "workable":
      return workableRef(token, `https://apply.workable.com/${token}`);
    case "teamtailor":
      return teamtailorRef(token, `https://${token}.teamtailor.com/jobs`);
    case "recruitee":
      return recruiteeRef(token, `https://${token}.recruitee.com/`);
    default:
      return null;
  }
}

const HOST_NOISE =
  /ashbyhq|greenhouse|lever\.co|teamtailor|workable|recruitee|personio|smartrecruiters|google|gstatic|cloudflare|schema\.org|w3\.org|sentry|hubspot|linkedin|facebook|twitter|instagram|youtube|github|doubleclick|recaptcha|googletagmanager|fontawesome|jsdelivr|unpkg|cloudfront|amazonaws|microsoft|gravatar|typekit|googleapis|cookiebot|segment\.(com|io)|intercom|hotjar|datadog|jquery|bootstrapcdn|slack|notion|medium\.com|apple\.com|spotify|wikipedia|wordpress|wp\.com|cdn\.|static\.|assets\./i;

export function siteLabel(hostOrUrl: string): string {
  let host = hostOrUrl.trim();
  try {
    if (host.includes("://")) host = new URL(host).hostname;
  } catch {
    return "";
  }
  host = host.toLowerCase().replace(/^www\./, "");
  if (
    host.endsWith(".teamtailor.com") ||
    host.endsWith(".recruitee.com") ||
    host.endsWith(".jobs.personio.de") ||
    host.endsWith(".jobs.personio.com")
  ) {
    return host.split(".")[0]?.replace(/-/g, "") ?? "";
  }
  const parts = host.split(".").filter(Boolean);
  const label = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? "");
  return label.replace(/-/g, "");
}

export function companyHostsInHtml(html: string): string[] {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    const host = match[1].toLowerCase().replace(/^www\./, "").replace(/\\+/g, "");
    if (!host.includes(".") || HOST_NOISE.test(host)) continue;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([host]) => host);
}

export function boardSiteVerdict(
  companyWebsite: string | null,
  boardHosts: string[],
): "match" | "mismatch" | "unknown" {
  if (!companyWebsite || boardHosts.length === 0) return "unknown";
  const expected = siteLabel(companyWebsite);
  if (!expected) return "unknown";
  const related = (host: string) => {
    const label = siteLabel(host);
    if (!label) return false;
    if (label === expected) return true;
    return expected.length >= 4 && (label.startsWith(expected) || label.endsWith(expected));
  };
  return boardHosts.some(related) ? "match" : "mismatch";
}

export const SOURCE_LABEL: Record<JobSource, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  teamtailor: "Teamtailor",
  recruitee: "Recruitee",
  personio: "Personio",
  smartrecruiters: "SmartRecruiters",
};
