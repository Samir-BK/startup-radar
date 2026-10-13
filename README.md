# Open roles at Finnish startups

A small dashboard that reads the public [Startup100](https://startup100.net/companies/) company directory and collects job ads those companies publish on their own career sites.

**Yes, this is possible — with limits.** The company list is ordinary public HTML. The jobs are not in one feed. Each company posts roles on its own site, or on a hiring system such as Teamtailor, Greenhouse, Lever, or Ashby. This project reads those public pages and puts the rows in one place: company, job title, location, link, and date posted.

## What you get

- A searchable list of open roles, with a Finland filter and a remote filter
- The company directory, with links back to Startup100, the company website, and the careers page
- A CSV download for a spreadsheet
- A script you can run again whenever you want a fresh copy

## Run it

```bash
npm install
npm run sync
npm run dev
```

Open [http://127.0.0.1:41731](http://127.0.0.1:41731).

`npm run sync` is the collector. It is polite on purpose: it pauses between requests, sends a named user agent, and skips a site when `robots.txt` asks all bots to stay out. A full pass over the directory takes a while. If it stops, run the same command again. Companies that were already checked are skipped.

Useful flags:

```bash
npm run sync -- --limit 30
npm run sync -- --slugs wolt,upcloud,hoxhunt
npm run sync -- --refresh
npm run sync -- --include-closed
```

`--include-closed` also scans companies Startup100 marks as deceased. Acquired companies (“exited”) are scanned by default, because many of them still hire.

Check the parsers with:

```bash
npm test
```

## Step by step

1. Read the public letter pages (`/companies/a/` and the rest). That produces the company list.
2. Open each company profile and save the website, city, category, and a short description.
3. On the company website, look for a careers link or a known hiring system.
4. Read that system’s public job feed. Keep a guessed board only when its name matches the company.
5. Save one row per role.
6. Open the dashboard or download the CSV.
7. Run `npm run sync` on a schedule so new posts show up and closed posts disappear.

## Where the jobs come from

| Source | How it is read |
| --- | --- |
| Teamtailor | `jobs.json` on the career site. Common in Finland. |
| Greenhouse | `https://boards-api.greenhouse.io/v1/boards/{company}/jobs` |
| Lever | `https://api.lever.co/v0/postings/{company}?mode=json` |
| Ashby | `https://api.ashbyhq.com/posting-api/job-board/{company}` |
| Workable | Public widget API |
| Recruitee, Personio, SmartRecruiters | Public offer feed, when the company site links to it |

LinkedIn is not scraped. Pages that draw the job list only in the browser are not fully read. When a careers link is found anyway, it is kept on the company so you can open it yourself.

Example, using Wolt’s public Greenhouse board:

```ts
const response = await fetch(
  "https://boards-api.greenhouse.io/v1/boards/wolt/jobs",
);
const data = await response.json();

for (const job of data.jobs) {
  console.log(job.title, job.location?.name, job.absolute_url);
}
```

## Schedule

The dashboard reads `data/snapshot.json`. It does not collect on every page view.

GitHub Actions can refresh the file every Monday. The workflow is `.github/workflows/sync.yml`. It needs permission to commit the snapshot. After a new snapshot lands, redeploy the site if you publish it.

You can also run `npm run sync` yourself once a week. Nothing here requires a paid account.

## Limits and care

- Startup100 has no `robots.txt`. Its terms page is a privacy policy about data that startups submit. Do not copy the directory into a competing product. This app links back to each profile.
- Company websites are checked against `robots.txt` before a page is read.
- Requests are slow and identified as `Northlist/1.0`. Results are cached in the snapshot.
- Stored fields are the public ad: title, location, link, date, department. Not application forms, accounts, or email addresses.
- Some dates are missing because the hiring site did not provide one. The table says “Not listed” in that case.
- Coverage will never be 100%. That is the limit, not a bug to force past.

## Stack

Next.js, TypeScript, and Tailwind. The collector is `scripts/sync.ts`. Parsed pages and feeds are covered by `src/lib/parse.test.ts`.
