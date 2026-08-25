import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const DATABASE_NAME = "network_copilot_local";
const LOGIN_ROLE = "network_copilot_local_login";
const APPLICATION_ROLE = "network_copilot_app";

function dockerExecutable(): string {
  const configured = process.env.DOCKER_CLI_PATH?.trim();
  if (configured) return configured;
  const desktopCli = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
  return process.platform === "win32" && existsSync(desktopCli) ? desktopCli : "docker";
}

async function runDocker(args: string[], stdin?: string): Promise<void> {
  const child = spawn(dockerExecutable(), args, {
    cwd: process.cwd(),
    stdio: ["pipe", "inherit", "inherit"],
    windowsHide: true,
  });
  child.stdin.end(stdin);
  const code = await new Promise<number>((accept, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => {
      if (signal) reject(new Error(`Docker stopped by signal ${signal}`));
      else accept(exitCode ?? 1);
    });
  });
  if (code !== 0) throw new Error(`Docker command failed with exit code ${code}`);
}

function replaceEnvValue(content: string, key: string, value: string): string {
  const lines = content.split(/\r?\n/);
  let replaced = false;
  const updated = lines.map((line) => {
    if (!replaced && line.startsWith(`${key}=`)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!replaced) updated.push(`${key}=${value}`);
  return updated.join("\n");
}

async function main(): Promise<void> {
  const password = randomBytes(24).toString("hex");
  const roleSql = `
do $configure$
begin
  if not exists (select 1 from pg_roles where rolname='${LOGIN_ROLE}') then
    create role ${LOGIN_ROLE} login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$configure$;
alter role ${LOGIN_ROLE} password '${password}';
grant ${APPLICATION_ROLE} to ${LOGIN_ROLE};
`;
  await runDocker([
    "compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", DATABASE_NAME,
  ], roleSql);

  const applicationUrl = new URL(`postgresql://${LOGIN_ROLE}@127.0.0.1:5432/${DATABASE_NAME}`);
  applicationUrl.password = password;
  const migrationUrl = `postgresql://postgres:postgres@127.0.0.1:5432/${DATABASE_NAME}`;
  const envFile = resolve(".env.local");
  const temporaryFile = `${envFile}.local-switch.tmp`;
  let content = await readFile(envFile, "utf8");
  content = replaceEnvValue(content, "DATABASE_URL", applicationUrl.toString());
  content = replaceEnvValue(content, "DATABASE_MIGRATION_URL", migrationUrl);
  content = replaceEnvValue(content, "DATABASE_APPLICATION_ROLE", APPLICATION_ROLE);
  await writeFile(temporaryFile, content, "utf8");
  await rename(temporaryFile, envFile);
  console.log(`Configured .env.local to use ${DATABASE_NAME} on 127.0.0.1.`);
  console.log(`Application login ${LOGIN_ROLE} is restricted and switches to ${APPLICATION_ROLE} per transaction.`);
}

await main();
