import { TableClient, TableServiceClient, AzureNamedKeyCredential } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

const useAzurite = !process.env.AZURE_STORAGE_ACCOUNT_NAME;

let tableEndpoint: string;
let credential: AzureNamedKeyCredential | DefaultAzureCredential;
let allowInsecure = false;

if (useAzurite) {
  const account = "devstoreaccount1";
  const key = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";
  tableEndpoint = `http://127.0.0.1:10002/${account}`;
  credential = new AzureNamedKeyCredential(account, key);
  allowInsecure = true;
} else {
  const account = process.env.AZURE_STORAGE_ACCOUNT_NAME!;
  tableEndpoint = `https://${account}.table.core.windows.net`;
  credential = new DefaultAzureCredential();
}

export function getTableClient(tableName: string): TableClient {
  return new TableClient(tableEndpoint, tableName, credential as any, {
    allowInsecureConnection: allowInsecure,
  });
}

export function getTableServiceClient(): TableServiceClient {
  return new TableServiceClient(tableEndpoint, credential as any, {
    allowInsecureConnection: allowInsecure,
  });
}

export async function ensureTable(tableName: string): Promise<TableClient> {
  const client = getTableClient(tableName);
  try {
    await client.createTable();
  } catch (err: unknown) {
    const e = err as { statusCode?: number };
    if (e.statusCode !== 409) throw err; // 409 = already exists
  }
  return client;
}

// Azure Table Storage only supports primitive types — auto-serialize objects/arrays
function flattenForTable(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === "object") {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function seedTable<T extends Record<string, unknown>>(
  tableName: string,
  partitionKey: string,
  items: T[],
  getRowKey: (item: T) => string
): Promise<void> {
  const client = await ensureTable(tableName);
  for (const item of items) {
    await client.upsertEntity({
      partitionKey,
      rowKey: getRowKey(item),
      ...flattenForTable(item),
    });
  }
  console.log(`  ✓ Seeded ${items.length} items into '${tableName}'`);
}

export async function getAll<T>(
  tableName: string,
  partitionKey?: string
): Promise<T[]> {
  const client = getTableClient(tableName);
  const results: T[] = [];
  const filter = partitionKey ? `PartitionKey eq '${partitionKey}'` : undefined;
  const query = client.listEntities({ queryOptions: { filter } });
  for await (const entity of query) {
    results.push(entity as unknown as T);
  }
  return results;
}

export async function getById<T>(
  tableName: string,
  partitionKey: string,
  rowKey: string
): Promise<T | null> {
  const client = getTableClient(tableName);
  try {
    const entity = await client.getEntity(partitionKey, rowKey);
    return entity as unknown as T;
  } catch {
    return null;
  }
}

export async function upsertEntity<T extends Record<string, unknown>>(
  tableName: string,
  partitionKey: string,
  rowKey: string,
  data: T
): Promise<void> {
  const client = getTableClient(tableName);
  await client.upsertEntity({
    partitionKey,
    rowKey,
    ...data,
  });
}
