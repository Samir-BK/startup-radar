const FINLAND =
  /\b(finland|suomi|helsinki|espoo|vantaa|tampere|turku|oulu|jyväskylä|jyvaskyla|lahti|kuopio|pori|joensuu|lappeenranta|vaasa|rovaniemi|seinäjoki|seinajoki|hämeenlinna|hameenlinna|kotka|hyvinkää|hyvinkaa|järvenpää|jarvenpaa|salo|kokkola|mikkeli|rauma|kajaani|savonlinna|imatra|varkaus|riihimäki|riihimaki|espoo)\b|\bFI\b/i;

export function mentionsFinland(location: string | null): boolean {
  if (!location) return false;
  return FINLAND.test(location);
}

export function mentionsRemote(location: string | null): boolean {
  if (!location) return false;
  return /\bremote\b/i.test(location);
}

export function formatPosted(iso: string | null): string {
  if (!iso) return "Not listed";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not listed";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "not yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "not yet";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
