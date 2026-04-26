export interface AgentMeta {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  icon: string;
  color: string;
  description: string;
  longDescription: string;
  starters: string[];
  tools: string[];
}

export const AGENTS: AgentMeta[] = [
  {
    id: 'hr',
    slug: 'nebula-hr',
    name: 'HR Assistant',
    shortName: 'HR',
    icon: '👥',
    color: '#4A90D9',
    description: 'Crew screening, onboarding, leave requests, roster queries.',
    longDescription:
      'Manages all HR and personnel operations aboard Nebula Forge — list the crew roster, retrieve detailed profiles, screen incoming candidates, process leave requests, and onboard new crew members.',
    starters: [
      'Show me the current crew roster',
      'Screen candidate CAND-001 for the open position',
      'Process the pending leave requests',
      'Onboard candidate CAND-003 to the station',
    ],
    tools: [
      'get_crew_roster',
      'get_crew_profile',
      'screen_candidate',
      'process_leave_request',
      'onboard_crew_member',
    ],
  },
  {
    id: 'engineering',
    slug: 'nebula-engineering',
    name: 'Chief Engineer',
    shortName: 'Engineering',
    icon: '🛠️',
    color: '#E8A93B',
    description: 'Station systems, repair scheduling, diagnostics, power grid.',
    longDescription:
      'Monitors station systems, schedules and tracks repair tasks, runs diagnostics on individual systems, and provides full power-grid overviews with sector-level output and consumption.',
    starters: [
      'Show me the current status of all station systems.',
      'Schedule a repair for the Atmospheric Recycler Unit Alpha.',
      'Run a full diagnostic on the Primary Fusion Reactor.',
      "Give me a full overview of the station power grid.",
    ],
    tools: [
      'get_system_status',
      'schedule_repair',
      'list_repairs',
      'run_diagnostics',
      'get_power_grid',
    ],
  },
  {
    id: 'exploration',
    slug: 'nebula-exploration',
    name: 'Exploration Navigator',
    shortName: 'Exploration',
    icon: '🚀',
    color: '#6246d6',
    description: 'Mission planning, route optimization, celestial body database.',
    longDescription:
      'Helps commanders plan missions, calculate routes between celestial bodies, query the celestial body database, and track mission progress with crew safety and fuel efficiency in mind.',
    starters: [
      'Show me all currently active exploration missions.',
      'Plan a survey mission to Asteroid Theta-7.',
      'Calculate the best route from Nebula Forge Station to Europa.',
      'What celestial bodies are near Nebula Frontier Sector 7?',
    ],
    tools: [
      'list_missions',
      'create_mission',
      'get_celestial_bodies',
      'calculate_route',
      'update_mission_status',
    ],
  },
  {
    id: 'logistics',
    slug: 'nebula-logistics',
    name: 'Quartermaster',
    shortName: 'Logistics',
    icon: '📦',
    color: '#0a6f94',
    description: 'Supply chain, cargo tracking, inventory, storage capacity.',
    longDescription:
      'Manages cargo shipments, tracks inventory levels with low-stock warnings, processes supply orders, and monitors storage bay capacity utilization across the station.',
    starters: [
      'Track shipment SHP-001.',
      'Show me all medical supply inventory levels.',
      'Create an emergency supply order for fuel.',
      "What's our current storage capacity across all bays?",
    ],
    tools: [
      'list_shipments',
      'track_shipment',
      'get_inventory',
      'create_supply_order',
      'get_storage_capacity',
    ],
  },
  {
    id: 'materials',
    slug: 'nebula-materials',
    name: 'Material Analyst',
    shortName: 'Materials',
    icon: '🔬',
    color: '#0e8ab5',
    description: 'Sample cataloging, composition analysis, mineral classification.',
    longDescription:
      'Analyzes space materials, classifies minerals, runs comparative studies between samples, and generates detailed analysis reports with composition breakdowns and risk assessments.',
    starters: [
      'Analyze sample SAM-001 and provide a full composition breakdown.',
      'Compare samples SAM-002 and SAM-005.',
      'What mineral samples do we have from Asteroid Theta-7?',
      'Show me the full analysis report for sample SAM-004.',
    ],
    tools: [
      'get_samples',
      'analyze_sample',
      'compare_materials',
      'classify_mineral',
      'get_analysis_report',
    ],
  },
  {
    id: 'medbay',
    slug: 'nebula-medbay',
    name: 'Medical Officer',
    shortName: 'Med Bay',
    icon: '⚕️',
    color: '#dc3545',
    description: 'Crew health, checkups, medical records, medication inventory.',
    longDescription:
      'Manages crew health records, schedules medical checkups, tracks medication inventory, and handles medical incident reports with strict patient confidentiality.',
    starters: [
      'Show health status for crew member CREW-001',
      'Schedule a checkup for Lt. Kenji Tanaka',
      'Check medication inventory',
      'Report a medical emergency in Engineering',
    ],
    tools: [
      'get_crew_health',
      'schedule_checkup',
      'get_medical_records',
      'report_medical_incident',
      'get_medication_inventory',
    ],
  },
  {
    id: 'safety',
    slug: 'nebula-safety',
    name: 'Safety Officer',
    shortName: 'Safety',
    icon: '🛡️',
    color: '#d08a08',
    description: 'Incident reporting, radiation monitoring, audits, emergency protocols.',
    longDescription:
      'Monitors safety conditions, manages incident reports, tracks radiation levels across the station, and provides emergency protocol guidance — flagging critical issues prominently.',
    starters: [
      'Show all open safety incidents',
      'Report a coolant leak in Engineering',
      'Check radiation levels on the Command Bridge',
      "What's the protocol for a hull breach?",
    ],
    tools: [
      'get_incidents',
      'report_incident',
      'check_radiation_levels',
      'run_safety_audit',
      'get_emergency_protocols',
    ],
  },
  {
    id: 'science',
    slug: 'nebula-science',
    name: 'Science Officer',
    shortName: 'Science',
    icon: '🧪',
    color: '#0ba677',
    description: 'Experiment tracking, observation logging, hypotheses, publications.',
    longDescription:
      'Assists researchers with experiment tracking, observation logging, research data queries, hypothesis submission, and publication management.',
    starters: [
      'Show active experiments',
      'Log an observation for experiment EXP-001',
      'Search research data about dark energy',
      'List published papers',
    ],
    tools: [
      'get_experiments',
      'log_observation',
      'query_research_data',
      'get_publications',
      'submit_hypothesis',
    ],
  },
  {
    id: 'comms',
    slug: 'nebula-comms',
    name: 'Comms Officer',
    shortName: 'Comms',
    icon: '📡',
    color: '#1ea8d8',
    description: 'Signal relays, crew messaging, deep-space transmissions, comm logs.',
    longDescription:
      'Manages station communications, monitors relay status, handles message routing, and schedules deep-space transmissions — prioritizing emergency communications.',
    starters: [
      'Send a station-wide broadcast',
      'Check signal relay status',
      'Schedule a transmission to Earth Command',
      'Show recent priority messages',
    ],
    tools: [
      'get_messages',
      'send_broadcast',
      'check_signal_status',
      'schedule_transmission',
      'get_comm_logs',
    ],
  },
];

export function findAgent(id: string): AgentMeta | undefined {
  return AGENTS.find((a) => a.id === id || a.slug === id);
}
