"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Guide } from "@/components/guide";
import { csvEscape, formatPosted, formatWhen, mentionsFinland, mentionsRemote } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/parse";
import type { Company, Job, JobSource, Snapshot } from "@/lib/types";

const PAGE_SIZE = 25;
type PlaceFilter = "all" | "finland" | "remote";

export function Board({ snapshot }: { snapshot: Snapshot }) {
  const [tab, setTab] = useState("roles");
  const hiring = snapshot.companies.filter((company) =>
    snapshot.jobs.some((job) => job.companySlug === company.slug),
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-6 md:py-12">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
            Startup100 · Finland
          </p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight text-foreground md:text-5xl">
            Open roles
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Jobs posted by startups in the Startup100 directory. Each row is a
            public listing: company, title, location, link, and date, when the
            hiring site provides one.
          </p>
        </div>
        <Button size="lg" onClick={() => downloadCsv(snapshot)} disabled={snapshot.jobs.length === 0}>
          <Download />
          Download CSV
        </Button>
      </header>

      {!snapshot.complete && snapshot.companies.length > 0 && (
        <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          Collection is still in progress
          {snapshot.directoryCount
            ? `: ${snapshot.companies.filter((company) => company.scannedAt).length} of ${snapshot.directoryCount} companies checked`
            : ""}
          . Refresh this page after the sync finishes. Run{" "}
          <code>npm run sync</code> to continue a partial scan.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Companies" value={snapshot.companies.length} />
        <Stat label="Open roles" value={snapshot.jobs.length} />
        <Stat label="Companies hiring" value={hiring} />
        <Stat label="Last collected" value={formatWhen(snapshot.generatedAt)} small />
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="h-10">
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="guide">How this works</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="pt-4">
          <Roles jobs={snapshot.jobs} companies={snapshot.companies} />
        </TabsContent>
        <TabsContent value="companies" className="pt-4">
          <Companies companies={snapshot.companies} jobs={snapshot.jobs} />
        </TabsContent>
        <TabsContent value="guide" className="pt-4">
          <Guide />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, small = false }: { label: string; value: string | number; small?: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={small ? "text-sm font-medium" : "font-heading text-2xl"}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Roles({ jobs, companies }: { jobs: Job[]; companies: Company[] }) {
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<PlaceFilter>("all");
  const [source, setSource] = useState<JobSource | "all">("all");
  const [page, setPage] = useState(1);
  const companyBySlug = useMemo(
    () => new Map(companies.map((company) => [company.slug, company])),
    [companies],
  );
  const sources = useMemo(() => {
    const present = new Set(jobs.map((job) => job.source));
    return (Object.keys(SOURCE_LABEL) as JobSource[]).filter((item) => present.has(item));
  }, [jobs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs
      .filter((job) => {
        if (source !== "all" && job.source !== source) return false;
        if (place === "finland" && !mentionsFinland(job.location)) return false;
        if (place === "remote" && !mentionsRemote(job.location)) return false;
        if (!needle) return true;
        const company = companyBySlug.get(job.companySlug);
        const haystack = [
          job.title,
          job.companyName,
          job.location,
          job.department,
          company?.city,
          company?.category,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => {
        const aTime = a.postedAt ? Date.parse(a.postedAt) : 0;
        const bTime = b.postedAt ? Date.parse(b.postedAt) : 0;
        return bTime - aTime || a.title.localeCompare(b.title);
      });
  }, [jobs, query, place, source, companyBySlug]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="sr-only" htmlFor="role-search">
          Search roles
        </label>
        <Input
          id="role-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search a title, company, or city"
          className="h-10 md:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          <FilterButton
            active={place === "all"}
            onClick={() => {
              setPlace("all");
              setPage(1);
            }}
          >
            All locations
          </FilterButton>
          <FilterButton
            active={place === "finland"}
            onClick={() => {
              setPlace("finland");
              setPage(1);
            }}
          >
            Finland
          </FilterButton>
          <FilterButton
            active={place === "remote"}
            onClick={() => {
              setPlace("remote");
              setPage(1);
            }}
          >
            Remote
          </FilterButton>
        </div>
      </div>
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterButton
            active={source === "all"}
            onClick={() => {
              setSource("all");
              setPage(1);
            }}
          >
            All sources
          </FilterButton>
          {sources.map((item) => (
            <FilterButton
              key={item}
              active={source === item}
              onClick={() => {
                setSource(item);
                setPage(1);
              }}
            >
              {SOURCE_LABEL[item]}
            </FilterButton>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {filtered.length === 0
          ? "No roles match."
          : `Showing ${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
      </p>

      {filtered.length === 0 ? (
        <Empty>
          {jobs.length === 0
            ? "No open roles have been collected yet. Run npm run sync, then refresh this page."
            : "Nothing matches that search. Try a company name, or switch the location filter back to all."}
        </Empty>
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden">
            {visible.map((job) => (
              <li key={job.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <JobBody job={job} company={companyBySlug.get(job.companySlug)} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Posted</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((job) => (
                  <tr key={job.id} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3 align-top">
                      <JobBody job={job} company={companyBySlug.get(job.companySlug)} />
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      {job.location ?? "Not listed"}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap text-muted-foreground">
                      {formatPosted(job.postedAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant="outline">{SOURCE_LABEL[job.source]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={current} pages={pages} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function JobBody({ job, company }: { job: Job; company: Company | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <a href={job.url} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">
        {job.title}
      </a>
      <p className="text-sm text-muted-foreground">
        {job.companyName}
        {company?.city ? ` · ${company.city}` : ""}
        {job.department ? ` · ${job.department}` : ""}
      </p>
      <p className="text-sm text-muted-foreground md:hidden">
        {job.location ?? "Location not listed"} · {formatPosted(job.postedAt)} · {SOURCE_LABEL[job.source]}
      </p>
    </div>
  );
}

function Companies({ companies, jobs }: { companies: Company[]; jobs: Job[] }) {
  const [query, setQuery] = useState("");
  const [onlyHiring, setOnlyHiring] = useState(false);
  const [page, setPage] = useState(1);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const job of jobs) map.set(job.companySlug, (map.get(job.companySlug) ?? 0) + 1);
    return map;
  }, [jobs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return companies.filter((company) => {
      const count = counts.get(company.slug) ?? 0;
      if (onlyHiring && count === 0) return false;
      if (!needle) return true;
      return [company.name, company.city, company.category, company.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [companies, counts, onlyHiring, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="sr-only" htmlFor="company-search">
          Search companies
        </label>
        <Input
          id="company-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search a company, city, or category"
          className="h-10 md:max-w-sm"
        />
        <FilterButton
          active={onlyHiring}
          onClick={() => {
            setOnlyHiring((value) => !value);
            setPage(1);
          }}
        >
          Hiring now
        </FilterButton>
      </div>
      <p className="text-sm text-muted-foreground">
        {filtered.length === 0
          ? "No companies match."
          : `${filtered.length} companies`}
      </p>
      {filtered.length === 0 ? (
        <Empty>
          {companies.length === 0
            ? "The company list is empty. Run npm run sync to read Startup100."
            : "No company matches that filter."}
        </Empty>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {visible.map((company) => {
              const count = counts.get(company.slug) ?? 0;
              return (
                <li key={company.slug} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-medium">{company.name}</h2>
                        <StatusBadge status={company.status} />
                        {count > 0 && <Badge>{count} open</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[company.city, company.category, company.founded ? `Founded ${company.founded}` : null]
                          .filter(Boolean)
                          .join(" · ") || "Details not listed"}
                      </p>
                      {company.blurb && (
                        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{company.blurb}</p>
                      )}
                      {company.detail && count === 0 && (
                        <p className="mt-2 text-sm text-muted-foreground">{company.detail}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-3 text-sm">
                      {company.website && (
                        <a className="text-primary hover:underline" href={company.website} target="_blank" rel="noreferrer">
                          Website
                        </a>
                      )}
                      {company.careersUrl && (
                        <a className="text-primary hover:underline" href={company.careersUrl} target="_blank" rel="noreferrer">
                          Careers
                        </a>
                      )}
                      <a className="text-primary hover:underline" href={company.profileUrl} target="_blank" rel="noreferrer">
                        Startup100
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pager page={current} pages={pages} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Company["status"] }) {
  if (status === "active") return null;
  const label =
    status === "exited" ? "Exited" : status === "deceased" ? "Closed" : "Established";
  return <Badge variant="outline">{label}</Badge>;
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <Button variant={active ? "default" : "outline"} size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <p className="text-sm text-muted-foreground">
        Page {page} of {pages}
      </p>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function downloadCsv(snapshot: Snapshot) {
  const companies = new Map(snapshot.companies.map((company) => [company.slug, company]));
  const header = ["company", "job title", "location", "link", "date posted", "source", "company city", "category"];
  const lines = [header.join(",")];
  for (const job of snapshot.jobs) {
    const company = companies.get(job.companySlug);
    lines.push(
      [
        job.companyName,
        job.title,
        job.location ?? "",
        job.url,
        job.postedAt ?? "",
        SOURCE_LABEL[job.source],
        company?.city ?? "",
        company?.category ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "finnish-startup-jobs.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
