import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";

const POSTGRES_IMAGE = process.env.DATABASE_BACKUP_IMAGE?.trim() || "pgvector/pgvector:pg16";

function dockerExecutable(): string {
  const configured = process.env.DOCKER_CLI_PATH?.trim();
  if (configured) return configured;
  const desktopCli = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
  return process.platform === "win32" && existsSync(desktopCli) ? desktopCli : "docker";
}

function backupConnectionString(): string {
  const configured = process.env.DATABASE_MIGRATION_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!configured) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required");
  const url = new URL(configured);
  const remote = !["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
  if (remote && !url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  return url.toString();
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function runDockerBackup(connectionString: string, outputDirectory: string, fileName: string): Promise<void> {
  const mount = `type=bind,source=${outputDirectory},target=/backup`;
  const script = [
    "set -eu",
    "IFS= read -r TASK_DATABASE_URL",
    "export TASK_DATABASE_URL",
    'pg_dump --dbname="$TASK_DATABASE_URL" --format=custom --no-owner --no-acl --file="/backup/$1"',
    'pg_restore --list "/backup/$1" >/dev/null',
    'pg_restore --list "/backup/$1" > "/backup/$1.restore-list"',
    'TASK_SCHEMA="$(mktemp)"',
    'pg_restore --schema-only --file="$TASK_SCHEMA" "/backup/$1"',
    'sed -n "/rds_vector_[a-z0-9_]*_ops/ { s/public\\.rds_vector_/public.vector_/g; p; }" "$TASK_SCHEMA" > "/backup/$1.portable-indexes.sql"',
    'sed -n "s/^CREATE INDEX \\([^ ]*\\).*rds_vector_[a-z0-9_]*_ops.*$/\\1/p" "$TASK_SCHEMA" | while IFS= read -r TASK_INDEX; do sed -i "/ INDEX .* ${TASK_INDEX} /s/^/;/" "/backup/$1.restore-list"; done',
    'rm -f "$TASK_SCHEMA"',
  ].join("; ");
  const child = spawn(dockerExecutable(), [
    "run", "--rm", "-i", "--mount", mount, POSTGRES_IMAGE,
    "sh", "-c", script, "backup", fileName,
  ], { stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
  child.stdin.end(`${connectionString}\n`);
  const exitCode = await new Promise<number>((accept, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Docker backup stopped by signal ${signal}`));
      else accept(code ?? 1);
    });
  });
  if (exitCode !== 0) throw new Error(`pg_dump failed with exit code ${exitCode}`);
}

async function main(): Promise<void> {
  const outputDirectory = resolve(process.env.DATABASE_BACKUP_DIR?.trim() || "backups/database");
  await mkdir(outputDirectory, { recursive: true });
  const fileName = `network_copilot_${timestamp()}.dump`;
  const outputFile = resolve(outputDirectory, fileName);
  try {
    await runDockerBackup(backupConnectionString(), outputDirectory, fileName);
    const details = await stat(outputFile);
    if (!details.isFile() || details.size === 0) throw new Error("pg_dump produced an empty backup");
    const digest = await sha256(outputFile);
    const manifest = {
      createdAt: new Date().toISOString(),
      file: basename(outputFile),
      bytes: details.size,
      sha256: digest,
      format: "PostgreSQL custom archive",
      image: POSTGRES_IMAGE,
      ownerAndAclIncluded: false,
      portableRestoreList: `${basename(outputFile)}.restore-list`,
      portableIndexSql: `${basename(outputFile)}.portable-indexes.sql`,
    };
    await writeFile(`${outputFile}.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Backup created: ${outputFile}`);
    console.log(`Size: ${details.size} bytes`);
    console.log(`SHA-256: ${digest}`);
  } catch (error) {
    await unlink(outputFile).catch(() => undefined);
    await unlink(`${outputFile}.restore-list`).catch(() => undefined);
    await unlink(`${outputFile}.portable-indexes.sql`).catch(() => undefined);
    throw error;
  }
}

await main();
