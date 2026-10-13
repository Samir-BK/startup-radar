import type { BoardParse, BoardRef, JobDraft, JobSource } from "./types";
import { decodeHtml, stripTags } from "./parse";

export function parseBoard(source: JobSource, body: string, ref: BoardRef): BoardParse {
  switch (source) {
    case "greenhouse":
      return parseGreenhouse(body, ref);
    case "lever":
      return parseLever(body, ref);
    case "ashby":
      return parseAshby(body, ref);
    case "workable":
      return parseWorkable(body, ref);
    case "teamtailor":
      return parseTeamtailor(body, ref);
    case "recruitee":
      return parseRecruitee(body, ref);
    case "personio":
      return parsePersonio(body, ref);
    case "smartrecruiters":
      return parseSmartRecruiters(body, ref);
  }
}

function parseGreenhouse(body: string, ref: BoardRef): BoardParse {
  const data = asRecord(parseJson(body));
  const jobs = Array.isArray(data?.jobs) ? data.jobs : null;
  if (!jobs) return unrecognized();
  const drafts = jobs.flatMap((entry) => {
    const job = asRecord(entry);
    if (!job || typeof job.title !== "string" || typeof job.absolute_url !== "string") return [];
    const location = asRecord(job.location);
    return [
      draft({
        source: "greenhouse",
        token: ref.token,
        key: String(job.id ?? job.absolute_url),
        title: job.title,
        location: typeof location?.name === "string" ? location.name : null,
        url: job.absolute_url,
        postedAt: asString(job.first_published) ?? asString(job.updated_at),
        department: firstNamed(job.departments),
      }),
    ];
  });
  const boardName = drafts.length
    ? asString(asRecord(jobs[0])?.company_name)
    : null;
  return { recognized: true, boardName, jobs: drafts };
}

function parseLever(body: string, ref: BoardRef): BoardParse {
  const jobs = parseJson(body);
  if (!Array.isArray(jobs)) return unrecognized();
  const drafts = jobs.flatMap((entry) => {
    const job = asRecord(entry);
    if (!job || typeof job.text !== "string" || typeof job.hostedUrl !== "string") return [];
    const categories = asRecord(job.categories);
    return [
      draft({
        source: "lever",
        token: ref.token,
        key: String(job.id ?? job.hostedUrl),
        title: job.text,
        location: asString(categories?.location),
        url: job.hostedUrl,
        postedAt: fromMillis(job.createdAt),
        department: asString(categories?.team),
      }),
    ];
  });
  return { recognized: true, boardName: null, jobs: drafts };
}

function parseAshby(body: string, ref: BoardRef): BoardParse {
  const data = asRecord(parseJson(body));
  const jobs = Array.isArray(data?.jobs) ? data.jobs : null;
  if (!jobs) return unrecognized();
  const drafts = jobs.flatMap((entry) => {
    const job = asRecord(entry);
    if (!job || job.isListed === false) return [];
    if (typeof job.title !== "string" || typeof job.jobUrl !== "string") return [];
    const secondary = Array.isArray(job.secondaryLocations)
      ? job.secondaryLocations.filter((item): item is string => typeof item === "string")
      : [];
    const places = [asString(job.location), ...secondary].filter((item): item is string => Boolean(item));
    return [
      draft({
        source: "ashby",
        token: ref.token,
        key: String(job.id ?? job.jobUrl),
        title: job.title,
        location: places.length ? [...new Set(places)].join(" · ") : null,
        url: job.jobUrl,
        postedAt: asString(job.publishedAt),
        department: asString(job.department),
      }),
    ];
  });
  return { recognized: true, boardName: null, jobs: drafts };
}

function parseWorkable(body: string, ref: BoardRef): BoardParse {
  const data = asRecord(parseJson(body));
  const jobs = Array.isArray(data?.jobs) ? data.jobs : null;
  if (!jobs) return unrecognized();
  const drafts = jobs.flatMap((entry) => {
    const job = asRecord(entry);
    if (!job || typeof job.title !== "string") return [];
    const url = asString(job.url) ?? asString(job.application_url) ?? asString(job.shortlink);
    if (!url) return [];
    const location = asRecord(job.location);
    const places = [asString(location?.city), asString(location?.region), asString(location?.country)]
      .filter((item): item is string => Boolean(item));
    return [
      draft({
        source: "workable",
        token: ref.token,
        key: String(job.shortcode ?? url),
        title: job.title,
        location: places.length ? places.join(", ") : null,
        url,
        postedAt: asString(job.published_on) ?? asString(job.created_at),
        department: asString(job.department),
      }),
    ];
  });
  return { recognized: true, boardName: asString(data?.name), jobs: drafts };
}

function parseTeamtailor(body: string, ref: BoardRef): BoardParse {
  const data = asRecord(parseJson(body));
  if (!data || typeof data.version !== "string" || !String(data.version).includes("jsonfeed")) {
    return unrecognized();
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const drafts = items.flatMap((entry) => {
    const item = asRecord(entry);
    if (!item || typeof item.title !== "string" || typeof item.url !== "string") return [];
    const posting = asRecord(item._jobposting);
    return [
      draft({
        source: "teamtailor",
        token: ref.token,
        key: String(item.id ?? item.url),
        title: item.title,
        location: teamtailorLocation(posting?.jobLocation),
        url: item.url,
        postedAt: asString(item.date_published) ?? asString(posting?.datePosted),
        department: null,
      }),
    ];
  });
  return { recognized: true, boardName: asString(data.title), jobs: drafts };
}

function teamtailorLocation(value: unknown): string | null {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const names = list.flatMap((entry) => {
    const address = asRecord(asRecord(entry)?.address);
    return [asString(address?.addressLocality), asString(address?.addressRegion)].filter(
      (item): item is string => Boolean(item),
    );
  });
  const unique = [...new Set(names)];
  return unique.length ? unique.join(", ") : null;
}

function parseRecruitee(body: string, ref: BoardRef): BoardParse {
  const data = asRecord(parseJson(body));
  const offers = Array.isArray(data?.offers) ? data.offers : null;
  if (!offers) return unrecognized();
  const drafts = offers.flatMap((entry) => {
    const offer = asRecord(entry);
    if (!offer || typeof offer.title !== "string") return [];
    const url = asString(offer.careers_url) ?? asString(offer.url);
    if (!url) return [];
    return [
      draft({
        source: "recruitee",
        token: ref.token,
        key: String(offer.id ?? url),
        title: offer.title,
        location: asString(offer.location) ?? asString(offer.city),
        url,
        postedAt: asString(offer.published_at) ?? asString(offer.created_at),
        department: asString(offer.department),
      }),
    ];
  });
  return { recognized: true, boardName: asString(data?.name) ?? asString(data?.company_name), jobs: drafts };
}

function parsePersonio(body: string, ref: BoardRef): BoardParse {
  if (!/<workzag-jobs|<position>/i.test(body)) return unrecognized();
  const positions = body.match(/<position>[\s\S]*?<\/position>/gi) ?? [];
  const drafts = positions.flatMap((block) => {
    const title = xmlTag(block, "name");
    const id = xmlTag(block, "id");
    if (!title || !id) return [];
    const host = new URL(ref.jobsUrl).hostname;
    return [
      draft({
        source: "personio",
        token: ref.token,
        key: id,
        title,
        location: xmlTag(block, "office"),
        url: `https://${host}/job/${id}?language=en`,
        postedAt: xmlTag(block, "createdAt"),
        department: xmlTag(block, "department"),
      }),
    ];
  });
  return { recognized: true, boardName: null, jobs: drafts };
}

function parseSmartRecruiters(body: string, ref: BoardRef): BoardParse {
  const data = asRecord(parseJson(body));
  const content = Array.isArray(data?.content) ? data.content : null;
  if (!content) return unrecognized();
  const drafts = content.flatMap((entry) => {
    const job = asRecord(entry);
    if (!job || typeof job.name !== "string" || typeof job.id !== "string") return [];
    const location = asRecord(job.location);
    const places = [asString(location?.city), asString(location?.region), asString(location?.country)]
      .filter((item): item is string => Boolean(item));
    const department = asRecord(job.department);
    return [
      draft({
        source: "smartrecruiters",
        token: ref.token,
        key: job.id,
        title: job.name,
        location: location?.remote === true && places.length === 0 ? "Remote" : places.join(", ") || null,
        url: `https://jobs.smartrecruiters.com/${encodeURIComponent(ref.token)}/${job.id}`,
        postedAt: asString(job.releasedDate),
        department: asString(department?.label),
      }),
    ];
  });
  return { recognized: true, boardName: null, jobs: drafts };
}

function xmlTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  const text = stripTags(match[1]);
  return text || null;
}

function draft(input: {
  source: JobSource;
  token: string;
  key: string;
  title: string;
  location: string | null;
  url: string;
  postedAt: string | null;
  department: string | null;
}): JobDraft {
  const title = decodeHtml(input.title).replace(/\s+/g, " ").trim();
  return {
    id: `${input.source}:${input.token}:${input.key}`,
    title,
    location: clean(input.location),
    url: input.url,
    postedAt: toIso(input.postedAt),
    source: input.source,
    department: clean(input.department),
  };
}

function clean(value: string | null): string | null {
  if (!value) return null;
  const text = decodeHtml(value).replace(/\s+/g, " ").trim();
  return text || null;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed.includes("UTC") ? trimmed.replace("UTC", "Z") : trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function fromMillis(value: unknown): string | null {
  const millis = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(millis)) return null;
  return new Date(millis).toISOString();
}

function firstNamed(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return asString(asRecord(value[0])?.name);
}

function unrecognized(): BoardParse {
  return { recognized: false, boardName: null, jobs: [] };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
