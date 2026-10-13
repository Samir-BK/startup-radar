import type { BoardRef, Company, Job, JobDraft, JobSource, ScanStatus, Snapshot } from "./types";
import { parseBoard } from "./boards";
import { fetchText } from "./http";
import {
  boardSiteVerdict,
  boardsInHtml,
  careerLinks,
  companyHostsInHtml,
  detectBoard,
  guessBoard,
  namesMatch,
  parseCompanyPage,
  parseDirectory,
  parseRobotsDisallow,
  pathAllowed,
  urlsInText,
  type DirectoryEntry,
} from "./parse";
import { emptySnapshot, readSnapshot, writeSnapshot } from "./snapshot";

const DIRECTORY = "https://startup100.net";
const LETTERS = ["%23", ..."abcdefghijklmnopqrstuvwxyz".split(""), "%C3%A4"];
const GUESS_ORDER: JobSource[] = [
  "teamtailor",
  "greenhouse",
  "ashby",
  "lever",
  "workable",
  "recruitee",
];
const GENERIC_SLUGS = new Set([
  "app",
  "team",
  "jobs",
  "work",
  "data",
  "tech",
  "game",
  "games",
  "home",
  "open",
  "test",
  "demo",
  "shop",
  "cloud",
  "digital",
  "media",
  "studio",
  "labs",
  "group",
  "finland",
  "helsinki",
  "startup",
  "company",
]);

export interface SyncOptions {
  slugs?: string[];
  limit?: number;
  refresh?: boolean;
  includeClosed?: boolean;
}

export async function syncDirectory(options: SyncOptions = {}): Promise<Snapshot> {
  const directory = options.slugs?.length
    ? options.slugs.map((slug) => ({ slug, name: slug }))
    : await loadDirectory();
  console.log(`Directory: ${directory.length} companies`);

  const existing = options.refresh ? emptySnapshot() : await readSnapshot();
  const previous = new Map(existing.companies.map((company) => [company.slug, company]));
  const jobsBySlug = new Map<string, Job[]>();
  for (const job of existing.jobs) {
    const list = jobsBySlug.get(job.companySlug) ?? [];
    list.push(job);
    jobsBySlug.set(job.companySlug, list);
  }

  const companies: Company[] = directory.map((entry) => {
    const company = previous.get(entry.slug) ?? stubCompany(entry);
    // Older runs skipped acquired companies. They often still hire.
    if (company.scanStatus === "skipped-closed" && company.status !== "deceased") {
      company.scannedAt = null;
      company.scanStatus = "pending";
      company.detail = null;
    }
    return company;
  });

  let snapshot = assemble(companies, jobsBySlug, directory.length, false);
  await writeSnapshot(snapshot);

  const profileQueue = companies.filter((company) => options.refresh || !company.profiledAt);
  const profileLimit = options.limit ?? profileQueue.length;
  console.log(`Profiles to fetch: ${Math.min(profileLimit, profileQueue.length)}`);
  await mapPool(profileQueue.slice(0, profileLimit), 4, async (company, index) => {
    const updated = await fetchProfile(company);
    Object.assign(company, updated);
    if ((index + 1) % 50 === 0 || index + 1 === Math.min(profileLimit, profileQueue.length)) {
      snapshot = assemble(companies, jobsBySlug, directory.length, false);
      await writeSnapshot(snapshot);
      console.log(`Profiles saved: ${index + 1}`);
    }
  });

  const jobQueue = companies.filter((company) => {
    if (!company.profiledAt) return false;
    if (!options.refresh && company.scannedAt) return false;
    return true;
  });
  const jobLimit = options.limit ?? jobQueue.length;
  const jobsToScan = jobQueue.slice(0, jobLimit);
  console.log(`Job lookups: ${jobsToScan.length}`);

  let finished = 0;
  await mapPool(jobsToScan, 6, async (company) => {
    const outcome = await findJobs(company, options.includeClosed ?? false);
    company.careersUrl = outcome.careersUrl;
    company.jobSource = outcome.jobSource;
    company.scanStatus = outcome.scanStatus;
    company.detail = outcome.detail;
    company.scannedAt = new Date().toISOString();
    jobsBySlug.set(
      company.slug,
      outcome.jobs.map((job) => ({
        ...job,
        companySlug: company.slug,
        companyName: company.name,
      })),
    );
    finished += 1;
    const label = outcome.jobs.length
      ? `${outcome.jobs.length} via ${outcome.jobSource}`
      : outcome.scanStatus;
    console.log(`[${finished}/${jobsToScan.length}] ${company.name} — ${label}`);
    if (finished % 20 === 0) {
      snapshot = assemble(companies, jobsBySlug, directory.length, false);
      await writeSnapshot(snapshot);
    }
  });

  const complete =
    !options.limit &&
    !options.slugs?.length &&
    companies.every((company) => company.profiledAt && company.scannedAt);
  snapshot = assemble(companies, jobsBySlug, directory.length, complete);
  await writeSnapshot(snapshot);
  console.log(
    `Done. ${snapshot.jobs.length} jobs from ${snapshot.companies.filter((company) => company.scanStatus === "ok").length} companies.`,
  );
  return snapshot;
}

async function loadDirectory(): Promise<DirectoryEntry[]> {
  const pages = await mapPool(LETTERS, 2, async (letter) => {
    const response = await fetchStartup100(`${DIRECTORY}/companies/${letter}/`);
    if (!response) return [];
    return parseDirectory(response.text);
  });
  const seen = new Set<string>();
  const entries: DirectoryEntry[] = [];
  for (const page of pages) {
    if (!page) continue;
    for (const entry of page) {
      if (seen.has(entry.slug)) continue;
      seen.add(entry.slug);
      entries.push(entry);
    }
  }
  if (entries.length < 100) {
    throw new Error("Startup100 returned too few companies. Try again in a few minutes.");
  }
  return entries;
}

async function fetchProfile(company: Company): Promise<Company> {
  const response = await fetchStartup100(company.profileUrl);
  if (!response || response.status === 404) {
    return {
      ...company,
      profiledAt: new Date().toISOString(),
      scanStatus: "unreachable",
      detail: "Startup100 has no page for this company right now.",
      scannedAt: new Date().toISOString(),
    };
  }
  if (response.status !== 200) {
    return company;
  }
  const parsed = parseCompanyPage(response.text, { slug: company.slug, name: company.name });
  return {
    ...company,
    ...parsed,
    profiledAt: new Date().toISOString(),
  };
}

interface JobOutcome {
  careersUrl: string | null;
  jobSource: JobSource | null;
  scanStatus: ScanStatus;
  detail: string | null;
  jobs: JobDraft[];
}

async function findJobs(company: Company, includeClosed: boolean): Promise<JobOutcome> {
  if (!includeClosed && company.status === "deceased") {
    return {
      careersUrl: null,
      jobSource: null,
      scanStatus: "skipped-closed",
      detail: "Skipped. Startup100 lists this company as closed.",
      jobs: [],
    };
  }

  const hinted = company.blurb ? urlsInText(company.blurb).filter(isCareerish) : [];
  const hintedBoards = uniqueBoards(
    hinted.flatMap((link) => {
      const board = detectBoard(link);
      return board ? [board] : [];
    }),
  );
  if (hintedBoards.length > 0) {
    const fromProfile = await outcomeFromBoards(hintedBoards, hinted[0] ?? null);
    if (fromProfile?.scanStatus === "ok") return fromProfile;
  }
  const website = company.website;
  if (!website && hinted.length === 0) {
    const guessed = await guessJobs(company);
    if (guessed) return guessed;
    return {
      careersUrl: null,
      jobSource: null,
      scanStatus: "no-website",
      detail: "No website on the Startup100 profile.",
      jobs: [],
    };
  }

  let homepageHtml = "";
  let homepageUrl = website;
  if (website) {
    const robots = await robotsFor(website);
    if (robots && !pathAllowed(robots, website)) {
      const guessed = await guessJobs(company);
      if (guessed) return guessed;
      return {
        careersUrl: hinted[0] ?? null,
        jobSource: null,
        scanStatus: "robots",
        detail: "The company website asks bots not to read it.",
        jobs: [],
      };
    }
    const page = await fetchText(website, { timeout: 5500, maxBytes: 350_000 });
    if (page && page.status >= 200 && page.status < 400) {
      homepageHtml = page.text;
      homepageUrl = page.url;
    } else if (hinted.length === 0) {
      const guessed = await guessJobs(company);
      if (guessed) return guessed;
      return {
        careersUrl: null,
        jobSource: null,
        scanStatus: "unreachable",
        detail: "The company website did not respond.",
        jobs: [],
      };
    }
  }

  const fromSite = [
    ...hinted,
    ...(homepageHtml && homepageUrl ? careerLinks(homepageHtml, homepageUrl) : []),
    ...(homepageHtml ? boardsInHtml(homepageHtml).map((board) => board.pageUrl) : []),
  ];
  const uniqueLinks = [...new Set(fromSite)].slice(0, 6);
  const discovered = uniqueBoards([
    ...uniqueLinks.flatMap((link) => {
      const direct = detectBoard(link);
      return direct ? [direct] : [];
    }),
    ...(homepageHtml ? boardsInHtml(homepageHtml) : []),
  ]);

  let careersUrl = uniqueLinks.find((link) => !detectBoard(link)) ?? uniqueLinks[0] ?? null;
  let extraHtml = "";
  if (discovered.length === 0 && careersUrl && careersUrl !== homepageUrl) {
    const careerPage = await fetchText(careersUrl, { timeout: 5500, maxBytes: 350_000 });
    if (careerPage && careerPage.status >= 200 && careerPage.status < 400) {
      extraHtml = careerPage.text;
      careersUrl = careerPage.url;
      discovered.push(
        ...boardsInHtml(extraHtml),
        ...careerLinks(extraHtml, careerPage.url).flatMap((link) => {
          const board = detectBoard(link);
          return board ? [board] : [];
        }),
      );
      if (/teamtailor/i.test(extraHtml)) {
        const custom = await readCustomTeamtailor(careerPage.url);
        if (custom) discovered.unshift(custom);
      }
    }
  }

  const linked = uniqueBoards(discovered);
  const linkedOutcome = await outcomeFromBoards(linked, careersUrl);
  let emptyBoard: JobOutcome | null = null;
  if (linkedOutcome?.scanStatus === "ok") return linkedOutcome;
  if (linkedOutcome?.scanStatus === "board-empty") emptyBoard = linkedOutcome;
  if (/teamtailor/i.test(`${homepageHtml}\n${extraHtml}`) && homepageUrl) {
    const custom = await readCustomTeamtailor(careersUrl ?? homepageUrl);
    if (custom) {
      const parsed = await readBoard(custom);
      if (parsed?.recognized && parsed.jobs.length > 0) {
        return {
          careersUrl: custom.pageUrl,
          jobSource: "teamtailor",
          scanStatus: "ok",
          detail: null,
          jobs: parsed.jobs,
        };
      }
      if (parsed?.recognized && !emptyBoard) {
        emptyBoard = {
          careersUrl: custom.pageUrl,
          jobSource: "teamtailor",
          scanStatus: "board-empty",
          detail: "A public hiring board was found, and it has no open roles.",
          jobs: [],
        };
      }
    }
  }

  if (emptyBoard) return emptyBoard;

  const guessed = await guessJobs(company);
  if (guessed) return guessed;

  if (careersUrl) {
    return {
      careersUrl,
      jobSource: null,
      scanStatus: "no-board",
      detail: "A careers link was found, but the job list is not in a public feed.",
      jobs: [],
    };
  }
  return {
    careersUrl: null,
    jobSource: null,
    scanStatus: "no-board",
    detail: "No public hiring board was found.",
    jobs: [],
  };
}

async function guessJobs(company: Company): Promise<JobOutcome | null> {
  if (company.slug.length < 4 || GENERIC_SLUGS.has(company.slug)) return null;
  for (const source of GUESS_ORDER) {
    const board = guessBoard(source, company.slug);
    if (!board) continue;
    const parsed = await readBoard(board);
    if (!parsed?.recognized) continue;
    const boardName = parsed.boardName ?? (await titleName(board));
    if (!namesMatch(company.name, boardName)) continue;
    if ((await publishedSiteVerdict(company.website, board.pageUrl)) === "mismatch") continue;
    if (parsed.jobs.length === 0) {
      return {
        careersUrl: board.pageUrl,
        jobSource: source,
        scanStatus: "board-empty",
        detail: "A public hiring board was found, and it has no open roles.",
        jobs: [],
      };
    }
    return {
      careersUrl: board.pageUrl,
      jobSource: source,
      scanStatus: "ok",
      detail: null,
      jobs: parsed.jobs,
    };
  }
  return null;
}

async function outcomeFromBoards(
  boards: BoardRef[],
  careersUrl: string | null,
): Promise<JobOutcome | null> {
  let emptyBoard: JobOutcome | null = null;
  for (const board of boards) {
    const parsed = await readBoard(board);
    if (!parsed?.recognized) continue;
    if (parsed.jobs.length === 0) {
      emptyBoard = {
        careersUrl: board.pageUrl || careersUrl,
        jobSource: board.source,
        scanStatus: "board-empty",
        detail: "A public hiring board was found, and it has no open roles.",
        jobs: [],
      };
      continue;
    }
    return {
      careersUrl: board.pageUrl || careersUrl,
      jobSource: board.source,
      scanStatus: "ok",
      detail: null,
      jobs: parsed.jobs,
    };
  }
  return emptyBoard;
}

async function publishedSiteVerdict(website: string | null, pageUrl: string) {
  const response = await fetchText(pageUrl, { timeout: 8000, maxBytes: 180_000 });
  if (!response || response.status !== 200) return "unknown" as const;
  return boardSiteVerdict(website, companyHostsInHtml(response.text));
}

async function titleName(board: BoardRef): Promise<string | null> {
  if (board.source === "greenhouse") {
    const response = await fetchText(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.token)}`,
      { timeout: 8000, accept: "application/json" },
    );
    if (!response || response.status !== 200) return null;
    try {
      const name = (JSON.parse(response.text) as { name?: unknown }).name;
      return typeof name === "string" ? name : null;
    } catch {
      return null;
    }
  }
  if (board.source !== "ashby" && board.source !== "lever" && board.source !== "recruitee") {
    return null;
  }
  const response = await fetchText(board.pageUrl, { timeout: 8000, maxBytes: 80_000 });
  if (!response || response.status !== 200) return null;
  const title = response.text.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "";
  const cleaned = title
    .replace(/\s+/g, " ")
    .replace(/\s*(\||-|–|—)\s*(jobs|careers|open positions).*$/i, "")
    .replace(/^(jobs|careers)\s+(at\s+)?/i, "")
    .replace(/\s+(jobs|careers)$/i, "")
    .trim();
  return cleaned || null;
}

async function readCustomTeamtailor(pageUrl: string): Promise<BoardRef | null> {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return null;
  }
  const jobsUrl = `${origin}/jobs.json`;
  const response = await fetchText(jobsUrl, {
    timeout: 8000,
    accept: "application/json,application/feed+json",
  });
  if (!response || response.status !== 200) return null;
  if (!response.text.includes("jsonfeed")) return null;
  return {
    source: "teamtailor",
    token: new URL(pageUrl).hostname,
    jobsUrl,
    pageUrl,
  };
}

async function readBoard(board: BoardRef) {
  const response = await fetchText(board.jobsUrl, {
    timeout: 12000,
    maxBytes: 8_000_000,
    accept: "application/json,application/xml,application/feed+json,text/xml,*/*",
  });
  if (!response || response.status === 404 || response.status >= 400) return null;
  return parseBoard(board.source, response.text, board);
}

const robotsCache = new Map<string, string[] | null>();

async function robotsFor(website: string): Promise<string[] | null> {
  let origin: string;
  try {
    origin = new URL(website).origin;
  } catch {
    return null;
  }
  if (robotsCache.has(origin)) return robotsCache.get(origin) ?? null;
  const response = await fetchText(`${origin}/robots.txt`, { timeout: 3500, maxBytes: 80_000 });
  const rules =
    response && response.status === 200 ? parseRobotsDisallow(response.text) : null;
  robotsCache.set(origin, rules);
  return rules;
}

async function fetchStartup100(url: string) {
  const first = await fetchText(url, { timeout: 15000, maxBytes: 500_000 });
  if (first && (first.status === 429 || first.status === 503)) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    return fetchText(url, { timeout: 15000, maxBytes: 500_000 });
  }
  return first;
}

function isCareerish(url: string): boolean {
  return /career|jobs|greenhouse|lever\.co|ashby|teamtailor|workable|recruitee|personio|smartrecruiters|rekry|tyopaik/i.test(
    url,
  );
}

function uniqueBoards(boards: BoardRef[]): BoardRef[] {
  const seen = new Set<string>();
  const unique: BoardRef[] = [];
  for (const board of boards) {
    const key = `${board.source}:${board.token.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(board);
  }
  return unique;
}

function stubCompany(entry: DirectoryEntry): Company {
  return {
    slug: entry.slug,
    name: entry.name,
    profileUrl: `https://startup100.net/company/${entry.slug}`,
    website: null,
    city: null,
    category: null,
    founded: null,
    status: "active",
    blurb: null,
    careersUrl: null,
    jobSource: null,
    scanStatus: "pending",
    detail: null,
    profiledAt: null,
    scannedAt: null,
  };
}

function assemble(
  companies: Company[],
  jobsBySlug: Map<string, Job[]>,
  directoryCount: number,
  complete: boolean,
): Snapshot {
  const jobs = companies.flatMap((company) => jobsBySlug.get(company.slug) ?? []);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    directoryCount,
    complete,
    companies,
    jobs,
  };
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<R | undefined>> {
  const results = new Array<R | undefined>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        console.error("Skipped one item after an error", error);
      }
    }
  }
  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, () => run()));
  return results;
}
