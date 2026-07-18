// Applies pending Drizzle migrations. Run automatically during the Vercel
// build (see the "build" script). Safe to run repeatedly — drizzle tracks
// applied migrations in the __drizzle_migrations table and only runs new ones.
//
// If DATABASE_URL is not set (e.g. a local build, or a preview environment
// without a database), migrations are skipped so the build still succeeds.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;

if (!url) {
  console.log("[migrate] DATABASE_URL not set — skipping migrations");
  process.exit(0);
}

// onnotice: silence "already exists, skipping" NOTICEs on re-runs so the
// deploy log stays clean.
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("[migrate] migrations applied");
} catch (error) {
  console.error("[migrate] failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
