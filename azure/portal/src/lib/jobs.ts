import rawJobs from './jobs-data.json';

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  level: string;
  salary: string;
  posted: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
}

export const JOBS: Job[] = rawJobs as Job[];

export const DEPARTMENTS: string[] = Array.from(
  new Set(JOBS.map((j) => j.department)),
).sort();

const DEPT_COLORS: Record<string, string> = {
  Marketing:     '#6246d6',
  Engineering:   '#0e8ab5',
  Cybersecurity: '#dc3545',
  Sales:         '#0ba677',
  IT:            '#d08a08',
};
const FALLBACK = '#4a6a82';

export function deptColor(d: string): string {
  return DEPT_COLORS[d] ?? FALLBACK;
}

export function findJob(id: string): Job | undefined {
  return JOBS.find((j) => j.id === id);
}

export function formatPostedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
