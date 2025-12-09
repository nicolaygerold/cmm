#!/usr/bin/env bun

import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".config", "cmm");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

async function getApiKey(): Promise<string> {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }

  const configFile = Bun.file(CONFIG_FILE);
  if (await configFile.exists()) {
    const config = await configFile.json();
    if (config.apiKey) {
      return config.apiKey;
    }
  }

  console.log(`${c.yellow}No API key found.${c.reset} Let's set one up.\n`);
  const apiKey = prompt(`${c.cyan}Enter your Google Generative AI API key:${c.reset} `);

  if (!apiKey) {
    console.error(`${c.red}No API key provided. Exiting.${c.reset}`);
    process.exit(1);
  }

  await Bun.spawn(["mkdir", "-p", CONFIG_DIR]).exited;
  await Bun.write(CONFIG_FILE, JSON.stringify({ apiKey }, null, 2));
  await Bun.spawn(["chmod", "600", CONFIG_FILE]).exited;

  console.log(`\n${c.green}API key saved${c.reset} ${c.dim}${CONFIG_FILE}${c.reset}\n`);
  return apiKey;
}

async function getGitDiff(): Promise<{ staged: string; unstaged: string }> {
  const stagedProc = Bun.spawn(["git", "diff", "--staged"], {
    stdout: "pipe",
  });
  const unstagedProc = Bun.spawn(["git", "diff"], {
    stdout: "pipe",
  });

  const staged = await new Response(stagedProc.stdout).text();
  const unstaged = await new Response(unstagedProc.stdout).text();

  return { staged, unstaged };
}

async function generateCommitMessage(
  diff: { staged: string; unstaged: string },
  apiKey: string
): Promise<string> {
  const combinedDiff = [
    diff.staged && `## Staged Changes\n\`\`\`diff\n${diff.staged}\n\`\`\``,
    diff.unstaged &&
      `## Unstaged Changes\n\`\`\`diff\n${diff.unstaged}\n\`\`\``,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!combinedDiff) {
    return "No changes detected.";
  }

  const google = createGoogleGenerativeAI({ apiKey });

  const { text } = await generateText({
    model: google("gemini-3-pro-preview"),
    prompt: `You are a commit message generator following Conventional Commits specification.

Format:
<type>(<optional scope>): <Description>

<optional body>

<optional footer>

Types:
- feat: add/adjust/remove a feature
- fix: bug fix
- refactor: code restructure without behavior change
- perf: performance improvement
- style: formatting, whitespace (no behavior change)
- test: add/correct tests
- docs: documentation only
- build: build tools, dependencies, CI/CD
- ops: infrastructure, deployment
- chore: misc tasks (.gitignore, init, etc.)

Rules:
- Use imperative mood: "Add" not "Added" or "Adds"
- Test: subject should complete "If applied, this commit will <subject>"
- Capitalize the description after the colon
- Do NOT end subject with period
- Add ! before : for breaking changes (e.g., feat!: or feat(api)!:)
- Keep subject line under 50 chars total (72 hard limit)
- Wrap body at 72 characters per line
- Body: explain WHAT changed and WHY, not HOW (code shows how)
- Focus on the main logical change, ignore trivial helpers
- One commit = one logical change (atomic)
- Don't assume reader knows context; briefly explain the problem
- Footer: reference issues if relevant (Closes #123)

Git diff:
${combinedDiff}

Generate the commit message (raw text, no markdown code blocks):`,
  });

  return text;
}

function spinner() {
  const frames = ["   ", ".  ", ".. ", "..."];
  let i = 0;
  return setInterval(() => {
    process.stdout.write(`\r${c.dim}${frames[i++ % frames.length]}${c.reset}`);
  }, 150);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { staged: false, unstaged: false, help: false };
  
  for (const arg of args) {
    if (arg === "-s" || arg === "--staged") flags.staged = true;
    if (arg === "-u" || arg === "--unstaged") flags.unstaged = true;
    if (arg === "-h" || arg === "--help") flags.help = true;
  }
  
  if (!flags.staged && !flags.unstaged) {
    flags.staged = true;
    flags.unstaged = true;
  }
  
  return flags;
}

async function main() {
  const flags = parseArgs();
  
  if (flags.help) {
    console.log(`${c.bold}cmm${c.reset} - AI commit message generator\n`);
    console.log(`${c.cyan}Usage:${c.reset} cmm [options]\n`);
    console.log(`${c.cyan}Options:${c.reset}`);
    console.log(`  -s, --staged     Only analyze staged changes`);
    console.log(`  -u, --unstaged   Only analyze unstaged changes`);
    console.log(`  -h, --help       Show this help message\n`);
    console.log(`${c.dim}By default, both staged and unstaged changes are analyzed.${c.reset}`);
    process.exit(0);
  }
  
  const apiKey = await getApiKey();

  process.stdout.write(`${c.cyan}[1/2]${c.reset} Analyzing changes`);
  const spin1 = spinner();
  const fullDiff = await getGitDiff();
  clearInterval(spin1);
  process.stdout.write(`\r${c.green}[1/2]${c.reset} Analyzing changes ${c.dim}done${c.reset}\n`);

  const diff = {
    staged: flags.staged ? fullDiff.staged : "",
    unstaged: flags.unstaged ? fullDiff.unstaged : "",
  };

  if (!diff.staged && !diff.unstaged) {
    console.log(`\n${c.yellow}No changes detected.${c.reset}`);
    process.exit(0);
  }

  const stats = [];
  if (diff.staged) stats.push(`${c.green}staged${c.reset}`);
  if (diff.unstaged) stats.push(`${c.yellow}unstaged${c.reset}`);
  console.log(`${c.dim}     Found: ${stats.join(", ")} changes${c.reset}\n`);

  process.stdout.write(`${c.cyan}[2/2]${c.reset} Generating commit message`);
  const spin2 = spinner();
  const commitMessage = await generateCommitMessage(diff, apiKey);
  clearInterval(spin2);
  process.stdout.write(`\r${c.green}[2/2]${c.reset} Generating commit message ${c.dim}done${c.reset}\n`);

  const lines = commitMessage.trim().split("\n");
  const title = lines[0];
  const body = lines.slice(2).join("\n").trim();

  console.log(`\n${c.dim}${"─".repeat(50)}${c.reset}\n`);
  
  let cmd = `git commit -m "${title.replace(/"/g, '\\"')}"`;
  if (body) {
    cmd += ` -m "${body.replace(/"/g, '\\"')}"`;
  }
  
  console.log(cmd);
  console.log(`\n${c.dim}${"─".repeat(50)}${c.reset}`);
}

main().catch(console.error);
