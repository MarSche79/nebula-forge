import { z } from "zod";
import {
  createMcpServer,
  startServer,
  AgentConfig,
  ensureTable,
  getAll,
  getById,
  upsertEntity,
  maybeSeedOnStart,
} from "@nebula-forge/shared";
import { seed } from "./seed.js";
import type { CargoShipment } from "@nebula-forge/shared";

const config: AgentConfig = {
  name: "Nebula Forge Quartermaster",
  version: "1.0.0",
  description:
    "Supply chain & logistics — cargo tracking, inventory management, supply ordering, and storage capacity monitoring",
  port: 3007,
  instructions:
    "You are the Quartermaster AI for Nebula Forge station. Manage cargo shipments, track inventory levels, process supply orders, and monitor storage capacity. Flag items below minimum stock levels.",
};

const PARTITION_KEY = "nebula-forge";
const SHIPMENTS_TABLE = "nfShipments";
const INVENTORY_TABLE = "nfInventory";
const SUPPLY_ORDERS_TABLE = "nfSupplyOrders";

interface InventoryItem {
  id: string;
  name: string;
  category:
    | "food"
    | "medical"
    | "engineering"
    | "scientific"
    | "ammunition"
    | "fuel"
    | "general";
  quantity: number;
  unit: string;
  minimumStock: number;
  storageLocation: string;
  lastRestocked: string;
  expiryDate: string | null;
}

interface SupplyOrder {
  id: string;
  items: Array<{ name: string; quantity: number; unit: string }>;
  supplier: string;
  status: "draft" | "submitted" | "approved" | "shipped" | "delivered";
  priority: string;
  requestedBy: string;
  requestDate: string;
  estimatedDelivery: string;
}

// Azure Table Storage stores arrays/objects as JSON strings — deserialize them
function parseShipment(raw: Record<string, unknown>): CargoShipment {
  return {
    ...raw,
    items: typeof raw.items === "string" ? JSON.parse(raw.items) : raw.items,
  } as CargoShipment;
}

function parseSupplyOrder(raw: Record<string, unknown>): SupplyOrder {
  return {
    ...raw,
    items: typeof raw.items === "string" ? JSON.parse(raw.items) : raw.items,
  } as SupplyOrder;
}

async function main() {
  await ensureTable(SHIPMENTS_TABLE);
  await ensureTable(INVENTORY_TABLE);
  await ensureTable(SUPPLY_ORDERS_TABLE);

  const server = createMcpServer(config);

  // --- Tool 1: get_shipments ---
  server.tool(
    "get_shipments",
    "List all cargo shipments. Optionally filter by status.",
    {
      status: z
        .enum(["loading", "in-transit", "arrived", "unloading", "completed"])
        .optional()
        .describe("Filter shipments by status"),
    },
    async ({ status }) => {
      const raw = await getAll<Record<string, unknown>>(
        SHIPMENTS_TABLE,
        PARTITION_KEY
      );
      let shipments = raw.map(parseShipment);

      if (status) shipments = shipments.filter((s) => s.status === status);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(shipments, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 2: track_cargo ---
  server.tool(
    "track_cargo",
    "Track a specific cargo shipment by ID. Returns detailed tracking information.",
    {
      shipmentId: z
        .string()
        .describe("Shipment ID to track (e.g. SHP-001)"),
    },
    async ({ shipmentId }) => {
      const raw = await getById<Record<string, unknown>>(
        SHIPMENTS_TABLE,
        PARTITION_KEY,
        shipmentId
      );

      if (!raw) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Shipment "${shipmentId}" not found.`,
            },
          ],
          isError: true,
        };
      }

      const shipment = parseShipment(raw);

      // Build tracking summary
      const now = new Date("2187-03-15");
      const departure = new Date(shipment.departureDate);
      const arrival = new Date(shipment.estimatedArrival);
      const totalDays = Math.max(
        1,
        (arrival.getTime() - departure.getTime()) / (1000 * 60 * 60 * 24)
      );
      const elapsedDays = Math.max(
        0,
        (now.getTime() - departure.getTime()) / (1000 * 60 * 60 * 24)
      );
      const progressPercent = Math.min(
        100,
        Math.round((elapsedDays / totalDays) * 100)
      );

      const tracking = {
        shipment,
        tracking: {
          currentDate: "2187-03-15",
          transitProgress: `${progressPercent}%`,
          daysInTransit: Math.round(elapsedDays),
          daysRemaining: Math.max(
            0,
            Math.round(totalDays - elapsedDays)
          ),
          onSchedule: shipment.status !== "completed"
            ? progressPercent <= 100
            : true,
        },
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(tracking, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 3: get_inventory ---
  server.tool(
    "get_inventory",
    "Get current inventory levels. Optionally filter by category. Flags items below minimum stock.",
    {
      category: z
        .enum([
          "food",
          "medical",
          "engineering",
          "scientific",
          "ammunition",
          "fuel",
          "general",
        ])
        .optional()
        .describe("Filter inventory by category"),
    },
    async ({ category }) => {
      const raw = await getAll<Record<string, unknown>>(
        INVENTORY_TABLE,
        PARTITION_KEY
      );
      let items = raw as unknown as InventoryItem[];

      if (category) items = items.filter((i) => i.category === category);

      const result = items.map((item) => ({
        ...item,
        belowMinimum: item.quantity < item.minimumStock,
        stockWarning:
          item.quantity < item.minimumStock
            ? `⚠ BELOW MINIMUM — have ${item.quantity} ${item.unit}, need ${item.minimumStock}`
            : null,
      }));

      const lowStockCount = result.filter((r) => r.belowMinimum).length;
      const summary = {
        totalItems: result.length,
        lowStockItems: lowStockCount,
        items: result,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool 4: create_supply_order ---
  server.tool(
    "create_supply_order",
    "Create a new supply order. Generates an order with draft status.",
    {
      items: z
        .array(
          z.object({
            name: z.string().describe("Item name"),
            quantity: z.number().describe("Quantity to order"),
            unit: z.string().describe("Unit of measurement"),
          })
        )
        .describe("Items to order"),
      supplier: z.string().describe("Supplier name"),
      priority: z
        .enum(["low", "medium", "high", "critical"])
        .describe("Order priority"),
      requestedBy: z.string().describe("Name of person requesting the order"),
    },
    async ({ items, supplier, priority, requestedBy }) => {
      const existing = await getAll<Record<string, unknown>>(
        SUPPLY_ORDERS_TABLE,
        PARTITION_KEY
      );
      const nextNum = existing.length + 1;
      const id = `ORD-${String(nextNum).padStart(3, "0")}`;

      const order: SupplyOrder = {
        id,
        items,
        supplier,
        status: "draft",
        priority,
        requestedBy,
        requestDate: new Date().toISOString().split("T")[0],
        estimatedDelivery: "TBD",
      };

      await upsertEntity(SUPPLY_ORDERS_TABLE, PARTITION_KEY, id, {
        ...order,
        items: JSON.stringify(items),
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Supply order created successfully:\n${JSON.stringify(order, null, 2)}`,
          },
        ],
      };
    }
  );

  // --- Tool 5: check_storage_capacity ---
  server.tool(
    "check_storage_capacity",
    "Check storage bay capacity. Returns capacity summary per bay based on current inventory.",
    {},
    async () => {
      const raw = await getAll<Record<string, unknown>>(
        INVENTORY_TABLE,
        PARTITION_KEY
      );
      const items = raw as unknown as InventoryItem[];

      // Define bay capacities (mock data)
      const bayCapacities: Record<string, { maxCapacity: number; description: string }> = {
        "Bay Alpha-1": { maxCapacity: 15000, description: "Food & Water Storage" },
        "Bay Bravo-2": { maxCapacity: 500, description: "Medical Supplies" },
        "Bay Charlie-3": { maxCapacity: 500, description: "Engineering Materials" },
        "Bay Delta-4": { maxCapacity: 200, description: "Scientific Equipment" },
        "Bay Echo-5": { maxCapacity: 8000, description: "Ammunition & Defense" },
        "Bay Foxtrot-6": { maxCapacity: 1000, description: "Fuel & Reactor Supplies" },
        "Bay Golf-7": { maxCapacity: 300, description: "General Stores" },
      };

      // Aggregate inventory quantities by bay
      const bayUsage: Record<string, number> = {};
      for (const item of items) {
        const bay = item.storageLocation;
        bayUsage[bay] = (bayUsage[bay] || 0) + item.quantity;
      }

      const bays = Object.entries(bayCapacities).map(
        ([bayName, { maxCapacity, description }]) => {
          const used = bayUsage[bayName] || 0;
          const utilization = Math.round((used / maxCapacity) * 100);
          return {
            bay: bayName,
            description,
            currentLoad: used,
            maxCapacity,
            utilizationPercent: utilization,
            status:
              utilization >= 90
                ? "CRITICAL"
                : utilization >= 70
                  ? "HIGH"
                  : utilization >= 40
                    ? "MODERATE"
                    : "LOW",
          };
        }
      );

      const totalUsed = bays.reduce((sum, b) => sum + b.currentLoad, 0);
      const totalCapacity = bays.reduce((sum, b) => sum + b.maxCapacity, 0);

      const summary = {
        stationTotal: {
          totalUsed,
          totalCapacity,
          overallUtilization: `${Math.round((totalUsed / totalCapacity) * 100)}%`,
        },
        bays,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }
  );

  await maybeSeedOnStart(seed);
  await startServer(server, config);
}

main().catch(console.error);
