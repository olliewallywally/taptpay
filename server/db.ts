import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { config } from "./config";

neonConfig.webSocketConstructor = ws;

export const pool = config.databaseUrl
  ? new Pool({ connectionString: config.databaseUrl })
  : null;
export const databaseClient = pool ? drizzle({ client: pool, schema }) : null;

// A few legacy route sites still import `db` directly. Keep their compile-time
// type until they migrate behind storage, while the runtime value stays null in
// the supported development/test MemStorage path.
export const db = databaseClient as NonNullable<typeof databaseClient>;
