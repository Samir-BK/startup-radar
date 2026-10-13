export type CompanyStatus = "active" | "exited" | "deceased" | "established";

export type JobSource =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "teamtailor"
  | "recruitee"
  | "personio"
  | "smartrecruiters";

export type ScanStatus =
  | "pending"
  | "no-website"
  | "unreachable"
  | "robots"
  | "no-board"
  | "board-empty"
  | "ok"
  | "skipped-closed";

export interface Company {
  slug: string;
  name: string;
  profileUrl: string;
  website: string | null;
  city: string | null;
  category: string | null;
  founded: string | null;
  status: CompanyStatus;
  blurb: string | null;
  careersUrl: string | null;
  jobSource: JobSource | null;
  scanStatus: ScanStatus;
  detail: string | null;
  profiledAt: string | null;
  scannedAt: string | null;
}

export interface Job {
  id: string;
  companySlug: string;
  companyName: string;
  title: string;
  location: string | null;
  url: string;
  postedAt: string | null;
  source: JobSource;
  department: string | null;
}

export interface Snapshot {
  version: 1;
  generatedAt: string | null;
  directoryCount: number;
  complete: boolean;
  companies: Company[];
  jobs: Job[];
}

export interface JobDraft {
  id: string;
  title: string;
  location: string | null;
  url: string;
  postedAt: string | null;
  source: JobSource;
  department: string | null;
}

export interface BoardParse {
  recognized: boolean;
  boardName: string | null;
  jobs: JobDraft[];
}

export interface BoardRef {
  source: JobSource;
  token: string;
  jobsUrl: string;
  pageUrl: string;
}
