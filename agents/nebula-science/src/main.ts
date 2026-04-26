import { z } from "zod";
import {
  createMcpServer,
  startServer,
  ensureTable,
  getAll,
  getById,
  upsertEntity,
  maybeSeedOnStart,
} from "@nebula-forge/shared";
import type { AgentConfig } from "@nebula-forge/shared";
import { seed } from "./seed.js";
import { randomUUID } from "crypto";

const config: AgentConfig = {
  name: "Nebula Forge Science Officer",
  version: "1.0.0",
  description:
    "Space science research — experiment tracking, observation logging, hypothesis management, and publication queries",
  port: 3004,
  instructions:
    "You are the Science Officer AI for Nebula Forge station. Assist researchers with experiment tracking, data queries, observation logging, and publication management. Encourage rigorous scientific methodology.",
};

const PARTITION_KEY = "nebula-forge";
const EXPERIMENTS_TABLE = "nfExperiments";
const OBSERVATIONS_TABLE = "nfObservations";
const PUBLICATIONS_TABLE = "nfPublications";

async function main() {
  await ensureTable(EXPERIMENTS_TABLE);
  await ensureTable(OBSERVATIONS_TABLE);
  await ensureTable(PUBLICATIONS_TABLE);

  const server = createMcpServer(config);

  // ── Tool 1: get_experiments ─────────────────────────────────────
  server.tool(
    "get_experiments",
    "List all scientific experiments. Optionally filter by status or department.",
    {
      status: z
        .enum(["proposed", "approved", "in-progress", "completed", "peer-review"])
        .optional()
        .describe("Filter by experiment status"),
      department: z.string().optional().describe("Filter by department name"),
    },
    async ({ status, department }) => {
      const experiments = await getAll<Record<string, unknown>>(
        EXPERIMENTS_TABLE,
        PARTITION_KEY
      );
      let results = experiments;
      if (status) results = results.filter((e) => e.status === status);
      if (department)
        results = results.filter((e) =>
          String(e.department).toLowerCase().includes(department.toLowerCase())
        );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: results.length, experiments: results },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── Tool 2: log_observation ─────────────────────────────────────
  server.tool(
    "log_observation",
    "Log a new scientific observation for an experiment.",
    {
      experimentId: z.string().describe("ID of the related experiment"),
      observer: z.string().describe("Name of the observer"),
      category: z
        .enum(["astrophysical", "biological", "chemical", "quantum", "geological"])
        .describe("Observation category"),
      data: z
        .record(z.unknown())
        .describe("Measurement data as key-value pairs"),
      significance: z
        .enum(["routine", "notable", "breakthrough"])
        .describe("Significance level"),
      notes: z.string().optional().describe("Additional notes"),
    },
    async ({ experimentId, observer, category, data, significance, notes }) => {
      const experiment = await getById<Record<string, unknown>>(
        EXPERIMENTS_TABLE,
        PARTITION_KEY,
        experimentId
      );
      if (!experiment) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Experiment "${experimentId}" not found.`,
            },
          ],
          isError: true,
        };
      }

      const id = `OBS-${randomUUID().slice(0, 6).toUpperCase()}`;
      const observation = {
        id,
        experimentId,
        observer,
        timestamp: new Date().toISOString(),
        category,
        data: JSON.stringify(data),
        significance,
        notes: notes || "",
      };

      await upsertEntity(OBSERVATIONS_TABLE, PARTITION_KEY, id, observation);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { message: "Observation logged successfully", observation },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── Tool 3: query_research_data ─────────────────────────────────
  server.tool(
    "query_research_data",
    "Search across experiments, observations, and publications by keyword.",
    {
      query: z.string().describe("Search keyword or phrase"),
    },
    async ({ query }) => {
      const q = query.toLowerCase();

      const experiments = await getAll<Record<string, unknown>>(
        EXPERIMENTS_TABLE,
        PARTITION_KEY
      );
      const observations = await getAll<Record<string, unknown>>(
        OBSERVATIONS_TABLE,
        PARTITION_KEY
      );
      const publications = await getAll<Record<string, unknown>>(
        PUBLICATIONS_TABLE,
        PARTITION_KEY
      );

      const matchExp = experiments.filter(
        (e) =>
          String(e.title).toLowerCase().includes(q) ||
          String(e.hypothesis).toLowerCase().includes(q) ||
          String(e.findings || "").toLowerCase().includes(q) ||
          String(e.department).toLowerCase().includes(q)
      );

      const matchObs = observations.filter(
        (o) =>
          String(o.notes || "").toLowerCase().includes(q) ||
          String(o.category).toLowerCase().includes(q) ||
          String(o.observer).toLowerCase().includes(q)
      );

      const matchPub = publications.filter(
        (p) =>
          String(p.title).toLowerCase().includes(q) ||
          String(p.abstract).toLowerCase().includes(q) ||
          String(p.journal).toLowerCase().includes(q)
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query,
                results: {
                  experiments: { count: matchExp.length, items: matchExp },
                  observations: { count: matchObs.length, items: matchObs },
                  publications: { count: matchPub.length, items: matchPub },
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

  // ── Tool 4: get_publications ────────────────────────────────────
  server.tool(
    "get_publications",
    "List research publications. Optionally filter by status.",
    {
      status: z
        .enum(["draft", "submitted", "published", "retracted"])
        .optional()
        .describe("Filter by publication status"),
    },
    async ({ status }) => {
      const publications = await getAll<Record<string, unknown>>(
        PUBLICATIONS_TABLE,
        PARTITION_KEY
      );
      let results = publications;
      if (status) results = results.filter((p) => p.status === status);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: results.length, publications: results },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── Tool 5: submit_hypothesis ───────────────────────────────────
  server.tool(
    "submit_hypothesis",
    "Submit a new research hypothesis, creating a proposed experiment.",
    {
      title: z.string().describe("Experiment title"),
      researcher: z.string().describe("Lead researcher name"),
      department: z.string().describe("Research department"),
      hypothesis: z.string().describe("Hypothesis statement"),
      relatedExperimentId: z
        .string()
        .optional()
        .describe("ID of a related experiment, if any"),
    },
    async ({ title, researcher, department, hypothesis, relatedExperimentId }) => {
      const id = `EXP-${randomUUID().slice(0, 6).toUpperCase()}`;
      const experiment = {
        id,
        title,
        leadResearcher: researcher,
        department,
        status: "proposed",
        startDate: new Date().toISOString().split("T")[0],
        hypothesis,
        findings: "",
        relatedExperimentId: relatedExperimentId || "",
      };

      await upsertEntity(EXPERIMENTS_TABLE, PARTITION_KEY, id, experiment);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: "Hypothesis submitted successfully. Experiment created in 'proposed' status.",
                experiment,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  await maybeSeedOnStart(seed);
  await startServer(server, config);
}

main().catch(console.error);
