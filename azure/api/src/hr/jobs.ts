// Static catalogue of jobs the HR pipeline knows about.
// Single source of truth for {title, department} per jobId across the API.
export interface JobMeta { title: string; department: string }

export const JOBS: Record<string, JobMeta> = {
  "mkt-001":  { title: "Digital Marketing Manager",    department: "Marketing" },
  "mkt-002":  { title: "Technical Content Strategist", department: "Marketing" },
  "sales-001":{ title: "Enterprise Account Executive", department: "Sales" },
  "sales-002":{ title: "Sales Engineer",                department: "Sales" },
  "eng-001":  { title: "Senior Cloud Engineer",         department: "Engineering" },
  "eng-002":  { title: "AI/ML Engineer",                department: "Engineering" },
  "it-001":   { title: "IT Infrastructure Specialist",  department: "IT" },
  "it-002":   { title: "Cloud Systems Administrator",   department: "IT" },
  "sec-001":  { title: "SOC Analyst (Tier 2)",          department: "Cybersecurity" },
  "sec-002":  { title: "Cloud Security Engineer",       department: "Cybersecurity" },
};

export function jobMeta(jobId: string): JobMeta | undefined {
  return JOBS[jobId];
}
