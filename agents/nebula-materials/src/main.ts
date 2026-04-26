import { z } from "zod";
import {
  createMcpServer,
  startServer,
  AgentConfig,
  ensureTable,
  getAll,
  getById,
  MaterialSample,
  maybeSeedOnStart,
} from "@nebula-forge/shared";
import { seed } from "./seed.js";

const config: AgentConfig = {
  name: "Nebula Forge Material Analyst",
  version: "1.0.0",
  description:
    "Space material analysis — sample cataloging, composition analysis, mineral classification, and comparative studies",
  port: 3002,
  instructions:
    "You are the Material Analysis AI for Nebula Forge station. Help scientists analyze space materials, classify minerals, compare samples, and generate analysis reports. Provide detailed scientific assessments.",
};

interface AnalysisReport {
  id: string;
  sampleId: string;
  analyst: string;
  date: string;
  methodology: string;
  findings: string;
  riskAssessment: "safe" | "caution" | "hazardous";
  potentialApplications: string[];
  recommendations: string;
}

const TABLE_SAMPLES = "nfsamples";
const TABLE_REPORTS = "nfanalysisreports";
const PK = "nebula-forge";

const server = createMcpServer(config);

// --- Tool 1: get_samples ---
server.tool(
  "get_samples",
  "List all material samples. Optional filter by type or status.",
  {
    type: z
      .enum(["mineral", "organic", "metallic", "gaseous", "unknown"])
      .optional()
      .describe("Filter by material type"),
    status: z
      .enum(["pending-analysis", "analyzed", "archived"])
      .optional()
      .describe("Filter by analysis status"),
  },
  async ({ type, status }) => {
    const samples = await getAll<MaterialSample>(TABLE_SAMPLES, PK);

    const filtered = samples.filter((s) => {
      if (type && s.type !== type) return false;
      if (status && s.status !== status) return false;
      return true;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              totalSamples: filtered.length,
              filters: { type: type ?? "all", status: status ?? "all" },
              samples: filtered.map((s) => ({
                id: s.id,
                name: s.name,
                origin: s.origin,
                type: s.type,
                status: s.status,
                collectedBy: s.collectedBy,
                collectedDate: s.collectedDate,
                notes: s.notes,
                composition: s.composition,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Tool 2: analyze_sample ---
server.tool(
  "analyze_sample",
  "Analyze a material sample by ID. Returns composition breakdown with percentages and risk level.",
  {
    sampleId: z.string().describe("Sample ID (e.g. SAM-001)"),
  },
  async ({ sampleId }) => {
    const sample = await getById<MaterialSample>(TABLE_SAMPLES, PK, sampleId);

    if (!sample) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: `Sample '${sampleId}' not found` },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    const composition =
      typeof sample.composition === "string"
        ? JSON.parse(sample.composition)
        : sample.composition;

    const unknownElements = Object.keys(composition).filter(
      (k) => k.startsWith("unknown") || k.startsWith("neutrino")
    );
    const riskLevel =
      unknownElements.length >= 2
        ? "hazardous"
        : unknownElements.length === 1
          ? "caution"
          : "safe";

    const sortedComposition = Object.entries(composition)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([element, pct]) => ({ element, percentage: pct }));

    const dominantElement = sortedComposition[0];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              sampleId: sample.id,
              name: sample.name,
              origin: sample.origin,
              type: sample.type,
              status: sample.status,
              collectedBy: sample.collectedBy,
              collectedDate: sample.collectedDate,
              analysis: {
                compositionBreakdown: sortedComposition,
                dominantElement: dominantElement.element,
                dominantPercentage: dominantElement.percentage,
                unknownElements,
                riskLevel,
                totalElements: sortedComposition.length,
              },
              notes: sample.notes,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Tool 3: compare_materials ---
server.tool(
  "compare_materials",
  "Compare two material samples side-by-side. Returns comparison of composition, origin, and type.",
  {
    sampleId1: z.string().describe("First sample ID"),
    sampleId2: z.string().describe("Second sample ID"),
  },
  async ({ sampleId1, sampleId2 }) => {
    const [sample1, sample2] = await Promise.all([
      getById<MaterialSample>(TABLE_SAMPLES, PK, sampleId1),
      getById<MaterialSample>(TABLE_SAMPLES, PK, sampleId2),
    ]);

    if (!sample1 || !sample2) {
      const missing = [
        !sample1 ? sampleId1 : null,
        !sample2 ? sampleId2 : null,
      ].filter(Boolean);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: `Sample(s) not found: ${missing.join(", ")}` },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    const comp1 =
      typeof sample1.composition === "string"
        ? JSON.parse(sample1.composition)
        : sample1.composition;
    const comp2 =
      typeof sample2.composition === "string"
        ? JSON.parse(sample2.composition)
        : sample2.composition;

    const allElements = [
      ...new Set([...Object.keys(comp1), ...Object.keys(comp2)]),
    ];

    const compositionComparison = allElements.map((element) => ({
      element,
      [sampleId1]: comp1[element] ?? 0,
      [sampleId2]: comp2[element] ?? 0,
      difference: Math.abs((comp1[element] ?? 0) - (comp2[element] ?? 0)),
    }));

    const sharedElements = allElements.filter(
      (e) => comp1[e] !== undefined && comp2[e] !== undefined
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              comparison: {
                sample1: {
                  id: sample1.id,
                  name: sample1.name,
                  origin: sample1.origin,
                  type: sample1.type,
                  status: sample1.status,
                  collectedBy: sample1.collectedBy,
                },
                sample2: {
                  id: sample2.id,
                  name: sample2.name,
                  origin: sample2.origin,
                  type: sample2.type,
                  status: sample2.status,
                  collectedBy: sample2.collectedBy,
                },
              },
              compositionComparison,
              summary: {
                sharedElements,
                sharedElementCount: sharedElements.length,
                totalUniqueElements: allElements.length,
                sameOrigin: sample1.origin === sample2.origin,
                sameType: sample1.type === sample2.type,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Tool 4: classify_mineral ---
server.tool(
  "classify_mineral",
  "Classify a mineral based on its physical and chemical properties. Returns classification with confidence score.",
  {
    composition: z
      .record(z.number())
      .describe("Element composition as { element: percentage }"),
    hardness: z.number().min(1).max(10).describe("Mohs hardness scale (1-10)"),
    luster: z
      .string()
      .describe(
        "Luster type (e.g. metallic, vitreous, adamantine, silky, pearly, resinous, waxy, dull)"
      ),
    crystalStructure: z
      .string()
      .describe(
        "Crystal system (e.g. cubic, hexagonal, tetragonal, orthorhombic, monoclinic, triclinic, trigonal, amorphous)"
      ),
  },
  async ({ composition, hardness, luster, crystalStructure }) => {
    const dominantElement = Object.entries(composition).sort(
      ([, a], [, b]) => b - a
    )[0];

    const siliconContent = composition["silicon"] ?? 0;
    const ironContent = composition["iron"] ?? 0;
    const carbonContent = composition["carbon"] ?? 0;
    const oxygenContent = composition["oxygen"] ?? 0;

    let classification = "Unclassified Specimen";
    let mineralGroup = "Unknown";
    let confidence = 0.5;

    // Silicate minerals
    if (siliconContent > 20 && oxygenContent > 15) {
      mineralGroup = "Silicate";
      if (hardness >= 7 && luster === "vitreous") {
        classification = "Quartz-class Silicate";
        confidence = 0.92;
      } else if (hardness >= 6 && crystalStructure === "monoclinic") {
        classification = "Feldspar-class Silicate";
        confidence = 0.87;
      } else if (crystalStructure === "hexagonal") {
        classification = "Beryl-class Silicate";
        confidence = 0.83;
      } else {
        classification = "General Silicate Mineral";
        confidence = 0.74;
      }
    }
    // Metallic/Oxide minerals
    else if (ironContent > 25) {
      mineralGroup = "Oxide/Metallic";
      if (luster === "metallic" && hardness >= 5) {
        classification = "Magnetite-class Oxide";
        confidence = 0.91;
      } else if (hardness < 5) {
        classification = "Hematite-class Oxide";
        confidence = 0.85;
      } else {
        classification = "Iron-dominant Metallic Mineral";
        confidence = 0.78;
      }
    }
    // Carbon-based minerals
    else if (carbonContent > 30) {
      mineralGroup = "Native Element / Organic";
      if (hardness >= 9) {
        classification = "Diamond-class Carbon Polymorph";
        confidence = 0.95;
      } else if (hardness <= 2) {
        classification = "Graphite-class Carbon Polymorph";
        confidence = 0.93;
      } else {
        classification = "Carbon-dominant Organic Compound";
        confidence = 0.72;
      }
    }
    // Noble gas / exotic minerals
    else if (
      Object.keys(composition).some(
        (k) => k.startsWith("unknown") || k.startsWith("xenon")
      )
    ) {
      mineralGroup = "Exotic / Uncharted";
      classification = "Xenomineral — Novel Classification Required";
      confidence = 0.45;
    }
    // Catch-all by crystal structure
    else if (crystalStructure === "cubic" && luster === "adamantine") {
      mineralGroup = "Native Element";
      classification = "Diamond-like Cubic Crystal";
      confidence = 0.7;
    } else if (crystalStructure === "amorphous") {
      mineralGroup = "Mineraloid";
      classification = "Amorphous Mineraloid (Obsidian-class)";
      confidence = 0.68;
    } else {
      confidence = 0.35;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              classification,
              mineralGroup,
              confidence,
              confidenceLabel:
                confidence >= 0.9
                  ? "High"
                  : confidence >= 0.7
                    ? "Moderate"
                    : confidence >= 0.5
                      ? "Low"
                      : "Very Low",
              inputProperties: {
                dominantElement: dominantElement[0],
                dominantPercentage: dominantElement[1],
                hardness,
                luster,
                crystalStructure,
              },
              notes:
                confidence < 0.5
                  ? "Classification confidence is very low. Additional analysis methods recommended — consider X-Ray Diffraction or Quantum Resonance Scanning."
                  : confidence < 0.7
                    ? "Moderate-to-low confidence. Supplementary testing advised to confirm classification."
                    : "Classification within acceptable confidence range.",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Tool 5: get_analysis_report ---
server.tool(
  "get_analysis_report",
  "Get the analysis report for a material sample by sample ID.",
  {
    sampleId: z
      .string()
      .describe("Sample ID to retrieve the analysis report for (e.g. SAM-001)"),
  },
  async ({ sampleId }) => {
    const reports = await getAll<AnalysisReport>(TABLE_REPORTS, PK);

    const report = reports.find((r) => r.sampleId === sampleId);

    if (!report) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `No analysis report found for sample '${sampleId}'`,
                suggestion:
                  "The sample may not have been analyzed yet. Check its status with get_samples or analyze_sample.",
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    const potentialApplications =
      typeof report.potentialApplications === "string"
        ? JSON.parse(report.potentialApplications)
        : report.potentialApplications;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              reportId: report.id,
              sampleId: report.sampleId,
              analyst: report.analyst,
              date: report.date,
              methodology: report.methodology,
              findings: report.findings,
              riskAssessment: report.riskAssessment,
              potentialApplications,
              recommendations: report.recommendations,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Start ---
async function main() {
  await ensureTable(TABLE_SAMPLES);
  await ensureTable(TABLE_REPORTS);
  await maybeSeedOnStart(seed);
  await startServer(server, config);
}

main().catch((err) => {
  console.error("Fatal error starting Nebula Materials agent:", err);
  process.exit(1);
});
