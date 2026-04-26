// Mock data for the Crew Dashboard widgets. These are deliberately seeded with
// realistic-feeling values for a fictive deep-space mining/research station
// so the UI looks alive without depending on the live MCP servers.

export interface SystemStatus {
  id: string;
  name: string;
  health: number;
  status: 'nominal' | 'degraded' | 'critical';
  lastCheck: string;
}

export interface PowerSector {
  sector: string;
  generated: number;
  consumed: number;
  capacity: number;
}

export interface Mission {
  id: string;
  name: string;
  destination: string;
  phase: 'planning' | 'enroute' | 'on-site' | 'returning';
  progress: number;
  crew: number;
  eta: string;
}

export interface Experiment {
  id: string;
  title: string;
  field: string;
  pi: string;
  observations: number;
  status: 'active' | 'paused' | 'analysis';
}

export interface Incident {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  status: 'open' | 'investigating' | 'resolved';
  reportedAt: string;
}

export interface Sample {
  id: string;
  origin: string;
  classification: string;
  composition: string;
  collectedAt: string;
}

export interface CommsEntry {
  id: string;
  channel: string;
  from: string;
  preview: string;
  priority: 'routine' | 'priority' | 'flash';
  at: string;
}

export const SYSTEMS: SystemStatus[] = [
  { id: 'reactor',    name: 'Primary Fusion Reactor',  health: 96, status: 'nominal',  lastCheck: '2 min ago'  },
  { id: 'lifesup',    name: 'Life-Support Recyclers',  health: 88, status: 'nominal',  lastCheck: '4 min ago'  },
  { id: 'gravity',    name: 'Gravity Generators',      health: 71, status: 'degraded', lastCheck: '11 min ago' },
  { id: 'shield',     name: 'Outer Hull Shielding',    health: 92, status: 'nominal',  lastCheck: '1 min ago'  },
  { id: 'comms',      name: 'Deep-Space Array',        health: 99, status: 'nominal',  lastCheck: 'just now'   },
  { id: 'thrust',     name: 'Manoeuvring Thrusters',   health: 84, status: 'nominal',  lastCheck: '6 min ago'  },
];

export const POWER_GRID: PowerSector[] = [
  { sector: 'Command',     generated: 480, consumed: 410, capacity: 600 },
  { sector: 'Engineering', generated: 1200, consumed: 1080, capacity: 1400 },
  { sector: 'Habitat',     generated: 360, consumed: 320, capacity: 500 },
  { sector: 'Research',    generated: 540, consumed: 470, capacity: 700 },
  { sector: 'Docking',     generated: 240, consumed: 195, capacity: 350 },
];

export const MISSIONS: Mission[] = [
  { id: 'M-117', name: 'Theta-7 Survey',         destination: 'Asteroid Theta-7',     phase: 'on-site',   progress: 64, crew: 4, eta: 'T+3d 14h' },
  { id: 'M-118', name: 'Europa Resupply',        destination: 'Europa Outpost',       phase: 'enroute',   progress: 38, crew: 6, eta: 'T+12d 02h' },
  { id: 'M-119', name: 'Frontier-7 Mapping',     destination: 'Nebula Frontier S-7',  phase: 'planning',  progress: 8,  crew: 3, eta: 'T+21d 00h' },
  { id: 'M-120', name: 'Comet 88P Intercept',    destination: 'Comet 88P/Halverson',  phase: 'returning', progress: 88, crew: 4, eta: 'T+1d 06h'  },
];

export const EXPERIMENTS: Experiment[] = [
  { id: 'EXP-014', title: 'Cryogenic Mineral Lattice Stability', field: 'Materials Science', pi: 'Dr. E. Vasquez', observations: 142, status: 'active' },
  { id: 'EXP-021', title: 'Microgravity Algae Cultivation',      field: 'Astrobiology',      pi: 'Lt. P. Nair',    observations: 87,  status: 'active' },
  { id: 'EXP-024', title: 'Dark-Energy Background Drift',         field: 'Astrophysics',      pi: 'Lt. P. Nair',    observations: 31,  status: 'analysis' },
  { id: 'EXP-027', title: 'Radiation-Resistant Polymer Synthesis', field: 'Materials Science', pi: 'Ens. D. Rourke', observations: 56,  status: 'paused' },
];

export const INCIDENTS: Incident[] = [
  { id: 'INC-204', title: 'Coolant leak — Engineering Sublevel 2', severity: 'high',     location: 'Eng. Deck',   status: 'investigating', reportedAt: '14 min ago' },
  { id: 'INC-205', title: 'Unauthorized access — Lab Omega',       severity: 'critical', location: 'Research',    status: 'open',          reportedAt: '38 min ago' },
  { id: 'INC-206', title: 'Airlock pressure anomaly — Bay 7',      severity: 'medium',   location: 'Docking',     status: 'open',          reportedAt: '1 h ago'    },
  { id: 'INC-207', title: 'Gravity flutter — Crew Alpha Dk 3',     severity: 'medium',   location: 'Habitat',     status: 'investigating', reportedAt: '2 h ago'    },
];

export const SAMPLES: Sample[] = [
  { id: 'SAM-014', origin: 'Asteroid Theta-7', classification: 'Carbonaceous',  composition: 'C 64% · O 18% · Fe 9%',  collectedAt: '6 h ago'  },
  { id: 'SAM-015', origin: 'Europa Subsurface', classification: 'Hydrate',      composition: 'H₂O 88% · CH₄ 7%',       collectedAt: '1 d ago'  },
  { id: 'SAM-016', origin: 'Comet 88P',         classification: 'Volatile-rich', composition: 'CO₂ 41% · NH₃ 22%',     collectedAt: '2 d ago'  },
];

export const COMMS: CommsEntry[] = [
  { id: 'C-9012', channel: 'CMD',     from: 'Earth Command',     preview: 'Approval received for survey extension to T+5d.',         priority: 'priority', at: '3 min ago' },
  { id: 'C-9013', channel: 'OPS',     from: 'Cargo Hauler Cygnus', preview: 'Begin docking approach at Bay 4 in 00:12.',             priority: 'routine',  at: '7 min ago' },
  { id: 'C-9014', channel: 'SAFETY',  from: 'Lab Omega Sensor',    preview: 'Three failed badge attempts. Lockdown engaged.',        priority: 'flash',    at: '38 min ago' },
  { id: 'C-9015', channel: 'SCIENCE', from: 'Dr. E. Vasquez',      preview: 'Lattice stability run #142 complete — see EXP-014.',    priority: 'routine',  at: '42 min ago' },
];

export const CREW_SUMMARY = {
  total: 217,
  onDuty: 184,
  onLeave: 18,
  medical: 6,
  offStation: 9,
};

export const STATION_HEADLINE_STATS = [
  { label: 'Crew on Duty',     value: CREW_SUMMARY.onDuty,        sub: `of ${CREW_SUMMARY.total} total` },
  { label: 'Active Missions',  value: MISSIONS.filter((m) => m.phase !== 'planning').length, sub: 'across the sector' },
  { label: 'Open Incidents',   value: INCIDENTS.filter((i) => i.status !== 'resolved').length, sub: 'requiring attention' },
  { label: 'Systems Nominal',  value: `${SYSTEMS.filter((s) => s.status === 'nominal').length}/${SYSTEMS.length}`, sub: 'station-wide' },
];
