// Reference Linux worker. This file is never started by the Waseet service.
// Configure an independently reviewed Docker daemon, pinned image and TLS proxy before running it.
import http from "node:http";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdir, mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
const root = resolve(process.env.WASEET_WORKER_STATE_DIR || "./worker-state");
const token = process.env.WASEET_AI_ISOLATED_WORKER_TOKEN || "";
const signing = process.env.WASEET_AI_ISOLATED_ATTESTATION_SECRET || "";
const image = process.env.WASEET_WORKER_IMAGE || "";
if (process.platform !== "linux" || token.length < 32 || signing.length < 32 || !/^.+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error("Linux, pinned image, authentication and attestation credentials are required.");
await mkdir(root, { recursive: true, mode: 0o700 });
const database = new DatabaseSync(join(root, "jobs.sqlite"));
database.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, result TEXT, created_at INTEGER NOT NULL);");
const hash = value => createHash("sha256").update(value).digest("hex");
const equal = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const bundle = artifacts => hash(JSON.stringify(artifacts.map(a => ({ name: a.name, sha256: a.sha256 })).sort((a,b) => a.name.localeCompare(b.name))));
function validate(value) {
  if (!value || !Array.isArray(value.artifacts) || value.artifacts.length < 1 || value.artifacts.length > 6 || !Array.isArray(value.commands) || value.commands.length < 1 || value.commands.length > 5 || value.network !== false || !Number.isInteger(value.memoryMb) || value.memoryMb < 64 || value.memoryMb > 1024 || !Number.isInteger(value.timeoutSeconds) || value.timeoutSeconds < 1 || value.timeoutSeconds > 120 || !Number.isFinite(value.cpuCount) || value.cpuCount < 0.1 || value.cpuCount > 2) throw new Error("Invalid resource policy.");
  let size = 0; const names = new Set();
  for (const artifact of value.artifacts) {
    const source = new URL(artifact.sourceUrl);
    if (source.protocol !== "https:" || source.username || source.password || !/^[a-z0-9_][a-z0-9_.-]{0,99}$/i.test(artifact.name) || names.has(artifact.name) || typeof artifact.contentBase64 !== "string") throw new Error("Invalid artifact.");
    names.add(artifact.name); const bytes = Buffer.from(artifact.contentBase64, "base64"); size += bytes.length;
    if (bytes.length > 512 * 1024 || size > 3 * 1024 * 1024 || hash(bytes) !== artifact.sha256) throw new Error("Artifact size/hash mismatch.");
  }
  if (bundle(value.artifacts) !== value.artifactHash) throw new Error("Artifact bundle mismatch.");
  for (const command of value.commands) if (!Array.isArray(command) || command.length < 1 || command.length > 30 || !["node", "python3", "npm"].includes(command[0]) || command.some(arg => typeof arg !== "string" || arg.length < 1 || arg.length > 500 || arg.includes("\0"))) throw new Error("Unsupported command.");
  return value;
}
async function cleanContainer(name) {
  await new Promise(resolveDone => { const child = spawn("docker", ["rm", "-f", name], { stdio: "ignore", timeout: 5000 }); child.on("error", resolveDone); child.on("close", resolveDone); });
}
async function runCommand(input, command, directory, artifactHash) {
  const name = "waseet-isolated-" + randomUUID(); let stdout = "", stderr = "";
  const args = ["run", "--rm", "--name", name, "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65534:65534", "--pids-limit=128", "--memory=" + input.memoryMb + "m", "--memory-swap=" + input.memoryMb + "m", "--cpus=" + input.cpuCount, "--tmpfs=/tmp:rw,noexec,nosuid,size=16m", "--workdir=/workspace", "--mount", "type=bind,source=" + directory + ",target=/workspace,readonly", "--env=HOME=/tmp", image, ...command];
  const exitCode = await new Promise(resolveExit => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    const timer = setTimeout(() => { child.kill("SIGKILL"); void cleanContainer(name); }, input.timeoutSeconds * 1000);
    child.stdout.on("data", data => { stdout += data.toString(); if (stdout.length > 12000) { stdout = stdout.slice(0, 12000); child.kill("SIGKILL"); void cleanContainer(name); } });
    child.stderr.on("data", data => { stderr += data.toString(); if (stderr.length > 12000) { stderr = stderr.slice(0, 12000); child.kill("SIGKILL"); void cleanContainer(name); } });
    child.once("error", () => { clearTimeout(timer); resolveExit(127); });
    child.once("close", code => { clearTimeout(timer); resolveExit(Number.isInteger(code) ? Math.min(255, Math.max(0, code)) : 124); });
  });
  await cleanContainer(name);
  return { command, exitCode, stdout, stderr, stdoutHash: hash(stdout), stderrHash: hash(stderr), artifactHash };
}
async function execute(input, id) {
  const directory = await mkdtemp(join(root, "artifact-")); await chmod(directory, 0o755);
  try {
    for (const artifact of input.artifacts) await writeFile(join(directory, artifact.name), Buffer.from(artifact.contentBase64, "base64"), { mode: 0o444, flag: "wx" });
    const evidence = []; for (const command of input.commands) evidence.push(await runCommand(input, command, directory, input.artifactHash));
    return { workerId: "reference-linux-docker", jobId: randomUUID(), idempotencyKey: id, artifactHash: input.artifactHash, policy: { isolated: true, network: false, secretsInjected: false, readOnlyRoot: true, nonRoot: true, capabilitiesDropped: true, memoryMb: input.memoryMb, cpuCount: input.cpuCount, timeoutSeconds: input.timeoutSeconds, pidsLimit: 128, imageDigest: image }, evidence };
  } finally { const path = resolve(directory); if (!path.startsWith(root + sep)) throw new Error("Workspace cleanup path escaped state directory."); await rm(path, { recursive: true, force: true }); }
}
function reply(response, status, body, signed = false) {
  const raw = JSON.stringify(body); response.writeHead(status, { "content-type": "application/json", ...(signed ? { "x-worker-signature": createHmac("sha256", signing).update(raw).digest("hex") } : {}) }); response.end(raw);
}
http.createServer(async (request, response) => {
  try {
    if (request.method !== "POST" || request.url !== "/execute" || !equal(String(request.headers.authorization || ""), "Bearer " + token)) return reply(response, 401, { error: "Unauthorized." });
    const chunks = []; let size = 0;
    for await (const part of request) { size += part.length; if (size > 5 * 1024 * 1024) return reply(response, 413, { error: "Request too large." }); chunks.push(part); }
    const raw = Buffer.concat(chunks).toString(), id = String(request.headers["idempotency-key"] || "");
    if (!/^[a-f0-9]{64}$/.test(id) || id !== hash(raw)) return reply(response, 400, { error: "Invalid idempotency key." });
    const input = validate(JSON.parse(raw));
    const prior = database.prepare("SELECT status,result FROM jobs WHERE id=?").get(id);
    if (prior?.status === "SUCCEEDED") return reply(response, 200, JSON.parse(prior.result), true);
    if (prior) return reply(response, 409, { error: "Execution exists or requires operator recovery; it was not rerun." });
    database.prepare("INSERT INTO jobs(id,status,created_at) VALUES(?,?,?)").run(id, "RUNNING", Date.now());
    try { const result = await execute(input, id); database.prepare("UPDATE jobs SET status='SUCCEEDED',result=? WHERE id=?").run(JSON.stringify(result), id); return reply(response, 200, result, true); }
    catch { database.prepare("UPDATE jobs SET status='FAILED' WHERE id=?").run(id); return reply(response, 503, { error: "Isolated execution failed." }); }
  } catch { reply(response, 400, { error: "Invalid execution request." }); }
}).listen(Number(process.env.WASEET_WORKER_PORT || 8095), "127.0.0.1");
