// Shared types for all Nebula Forge agents

export interface AgentConfig {
  name: string;
  version: string;
  description: string;
  port: number;
  instructions: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// Common Nebula Forge domain types
export interface CrewMember {
  id: string;
  name: string;
  rank: string;
  department: string;
  specialization: string;
  status: "active" | "on-leave" | "medical" | "off-station";
  joinDate: string;
  clearanceLevel: number;
}

export interface Mission {
  id: string;
  name: string;
  type: "exploration" | "research" | "supply-run" | "rescue" | "survey";
  status: "planned" | "in-progress" | "completed" | "aborted";
  commander: string;
  crew: string[];
  destination: string;
  departureDate: string;
  returnDate?: string;
  objectives: string[];
}

export interface MaterialSample {
  id: string;
  name: string;
  origin: string;
  collectedDate: string;
  collectedBy: string;
  type: "mineral" | "organic" | "metallic" | "gaseous" | "unknown";
  composition: Record<string, number>;
  status: "pending-analysis" | "analyzed" | "archived";
  notes?: string;
}

export interface SafetyIncident {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  location: string;
  reportedBy: string;
  reportedDate: string;
  status: "open" | "investigating" | "resolved" | "closed";
  description: string;
  resolution?: string;
}

export interface RepairTask {
  id: string;
  system: string;
  subsystem: string;
  priority: "low" | "medium" | "high" | "emergency";
  status: "scheduled" | "in-progress" | "completed" | "deferred";
  assignedTo: string;
  scheduledDate: string;
  description: string;
  completedDate?: string;
}

export interface CargoShipment {
  id: string;
  manifest: string;
  origin: string;
  destination: string;
  status: "loading" | "in-transit" | "arrived" | "unloading" | "completed";
  departureDate: string;
  estimatedArrival: string;
  weight: number;
  items: Array<{ name: string; quantity: number; unit: string }>;
}

export interface Experiment {
  id: string;
  title: string;
  leadResearcher: string;
  department: string;
  status: "proposed" | "approved" | "in-progress" | "completed" | "peer-review";
  startDate: string;
  endDate?: string;
  hypothesis: string;
  findings?: string;
}

export interface CommMessage {
  id: string;
  from: string;
  to: string;
  channel: "internal" | "deep-space" | "emergency" | "command";
  priority: "routine" | "priority" | "urgent" | "flash";
  timestamp: string;
  subject: string;
  body: string;
  status: "sent" | "received" | "acknowledged" | "failed";
}

export interface MedicalRecord {
  id: string;
  crewMemberId: string;
  crewMemberName: string;
  type: "checkup" | "treatment" | "emergency" | "vaccination" | "psychological";
  date: string;
  physician: string;
  diagnosis?: string;
  treatment?: string;
  status: "scheduled" | "completed" | "follow-up-required";
  notes?: string;
}

export interface RadiationReading {
  sectorId: string;
  sectorName: string;
  currentLevel: number;
  unit: string;
  safeThreshold: number;
  status: "normal" | "elevated" | "warning" | "critical";
  lastUpdated: string;
}

export interface StationSystem {
  id: string;
  name: string;
  category: "life-support" | "power" | "propulsion" | "communications" | "defense" | "environmental";
  status: "operational" | "degraded" | "offline" | "maintenance";
  healthPercent: number;
  lastInspection: string;
  nextInspection: string;
}
