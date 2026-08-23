/**
 * One pass that collects every credential a deploy needs and puts each one
 * where it actually goes.
 *
 *   node scripts/bootstrap-deploy.ts
 *
 * One of these can only be had by signing in to somebody else's website, so
 * this opens the browser at the right page and waits: the DuckDNS token. The
 * rest it fills in itself.
 *
 * What it produces by default is one file: `/srv/aow5/.env`, ready to copy to
 * the server. That is where the app's runtime secrets live — read by `docker
 * compose` at deploy time (infra/deploy.sh), never baked into an image, never
 * in GitHub.
 *
 * `--ci` additionally generates an SSH keypair, pins the host key, and offers
 * to set them as GitHub secrets. It is off by default because nothing in
 * .github/workflows/ deploys anything — a key sitting in GitHub that no
 * workflow reads is a credential with a blast radius and no job.
 *
 * Nothing here is destructive and nothing is published. It writes into a
 * gitignored directory, and under `--ci` shows exactly what it is about to set
 * before it sets it. Decline and the values are printed to paste by hand.
 */
import { spawnSync } from 'node:child_process';
import { resolve4 } from 'node:dns/promises';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, '.secrets');
const GH_ENVIRONMENT = 'production';

/**
 * Every key infra/.env.example defines, and which this script knows how to
 * fill in.
 *
 * The env file is produced by rewriting the example rather than by printing a
 * template from in here, so the example's comments — which are the
 * documentation for these values — cannot drift from what gets deployed. The
 * flip side is that adding a variable to the example without teaching this
 * script about it would silently ship an empty value, so writeEnvFile refuses
 * to write when it meets a key that is not in this list.
 */
const ENV_KEYS = ['SITE_DOMAIN', 'ACME_EMAIL', 'DUCKDNS_SUBDOMAIN', 'DUCKDNS_TOKEN'] as const;
type EnvKey = (typeof ENV_KEYS)[number];

type Answers = Record<EnvKey, string> & {
  deployHost: string;
  deployUser: string;
  deployPort: string;
};

const flags = new Set(process.argv.slice(2));
const OPEN_BROWSER = !flags.has('--no-open');
/**
 * Off by default, because nothing in CI deploys anything: `infra/deploy.sh` is
 * run by hand, and a private key sitting in GitHub that no workflow ever reads
 * is a credential with a blast radius and no job. Pass `--ci` the day there is
 * a workflow to use it, and this generates the keypair, pins the host key and
 * sets the secrets.
 */
const CI_ACCESS = flags.has('--ci');
/** With `--ci`, generate and pin everything but leave GitHub to you. */
const USE_GH = !flags.has('--no-github');
const VERIFY = !flags.has('--no-verify');
const FORCE_KEYGEN = flags.has('--force-keygen');

// ---------------------------------------------------------------------------
// Running things, asking things
// ---------------------------------------------------------------------------

function die(message: string): never {
  console.error(`\nbootstrap-deploy: ${message}`);
  process.exit(1);
}

interface RunResult {
  /** The executable was found. Distinct from `ok`, which also wants exit 0. */
  found: boolean;
  ok: boolean;
  stdout: string;
  stderr: string;
}

/**
 * `shell: true` only on Windows, and only as a retry after the executable was
 * not found — some tools install there as a `.cmd` shim, which Node will not
 * spawn directly. Doing it unconditionally would put every argument through
 * cmd.exe quoting, and one of these arguments is a private key.
 */
function run(command: string, argv: string[], input?: string): RunResult {
  const options = { input, encoding: 'utf8' as const, windowsHide: true };
  let result = spawnSync(command, argv, options);
  const missing = (result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
  if (missing && process.platform === 'win32') result = spawnSync(command, argv, { ...options, shell: true });

  return {
    found: (result.error as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT',
    ok: result.error === undefined && result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

/**
 * Presence, not success. `ssh-keygen` has no `--version` and exits non-zero on
 * one, so anything that keys off the exit status decides OpenSSH is missing on
 * a machine that has it.
 */
function have(command: string): boolean {
  return run(command, ['--version']).found;
}

function openBrowser(url: string): void {
  if (!OPEN_BROWSER) return;
  if (process.platform === 'win32') spawnSync('cmd', ['/c', 'start', '', url], { windowsHide: true });
  else if (process.platform === 'darwin') spawnSync('open', [url]);
  else spawnSync('xdg-open', [url]);
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });

/**
 * A `question()` whose input has already ended never settles, and what Node
 * prints for that is a warning about an unsettled top-level await pointing at
 * the last line of this file — which says nothing about what happened. This is
 * an interactive tool; if the input is gone, say so and stop.
 */
let stillAsking = true;
rl.on('close', () => {
  if (stillAsking) die('input ended before every question was answered. This one needs a terminal.');
});

/**
 * Muting is a flag over stdout rather than anything readline offers, because
 * the echo goes through `output.write` and that is the only place to intercept
 * it. The prompt is written before the mute goes up, so the question stays
 * visible while the answer does not.
 */
let muted = false;
const realWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk: string, ...rest: unknown[]) =>
  muted ? true : realWrite(chunk, ...(rest as []))) as typeof process.stdout.write;

async function ask(question: string, fallback = ''): Promise<string> {
  const answer = (await rl.question(`${question}${fallback === '' ? '' : ` [${fallback}]`}: `)).trim();
  return answer === '' ? fallback : answer;
}

async function askSecret(question: string): Promise<string> {
  if (process.stdin.isTTY !== true) return (await rl.question(`${question}: `)).trim();
  process.stdout.write(`${question} (hidden): `);
  muted = true;
  try {
    return (await rl.question('')).trim();
  } finally {
    muted = false;
    realWrite('\n');
  }
}

async function confirm(question: string, fallback: boolean): Promise<boolean> {
  return (await ask(`${question} (y/n)`, fallback ? 'y' : 'n')).toLowerCase().startsWith('y');
}

/** Re-asks until the value looks right. A typo here surfaces days later, in a log. */
async function askUntil(
  question: string,
  valid: RegExp,
  complaint: string,
  options: { fallback?: string; secret?: boolean } = {},
): Promise<string> {
  for (;;) {
    const value = options.secret === true ? await askSecret(question) : await ask(question, options.fallback ?? '');
    if (valid.test(value)) return value;
    console.log(`  ${complaint}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

// ---------------------------------------------------------------------------
// The output directory has to be ignored before anything is written into it
// ---------------------------------------------------------------------------

function prepareOutDir(): void {
  const ignorePath = join(REPO, '.gitignore');
  const entry = '.secrets/';

  if (!readFileSync(ignorePath, 'utf8').split(/\r?\n/).includes(entry)) {
    appendFileSync(
      ignorePath,
      '\n# Written by scripts/bootstrap-deploy.ts: the deploy keypair and a filled-in\n' +
        '# copy of the env file, staged on their way to the server and to GitHub.\n' +
        `${entry}\n`,
    );
    console.log(`Added ${entry} to .gitignore.`);
  }

  mkdirSync(OUT, { recursive: true });

  // Belt and braces. The append above can be defeated by a negation further
  // down the file, and "the secrets were ignored" is not a thing to assume —
  // ask git, which is the only opinion that counts. If git cannot be asked,
  // that is also a no: this is the check that stands between a private key and
  // a commit.
  const check = run('git', ['-C', REPO, 'check-ignore', '-q', join(OUT, 'probe')]);
  if (!check.found) die('git is not on PATH, so whether .secrets/ is ignored cannot be confirmed. Refusing to write.');
  if (!check.ok) {
    die(`git does not consider ${relative(REPO, OUT)}/ ignored. Refusing to write secrets into a tracked path.`);
  }
}

// ---------------------------------------------------------------------------
// The credential that comes from somebody else's login page
// ---------------------------------------------------------------------------

/**
 * DuckDNS has no read-only endpoint. The only call that proves a token is the
 * update call, and that call *sets the record* — issued blind from a laptop it
 * would point the site at whatever address that laptop is behind, which is a
 * broken site and a certificate that cannot be renewed.
 *
 * So this resolves the name first and sends back the address it already has,
 * making the update a no-op that still exercises the token. If the name does
 * not resolve yet there is no safe address to send, and the check is skipped
 * rather than guessed at.
 */
async function verifyDuckDns(subdomain: string, token: string): Promise<void> {
  if (!VERIFY) return;

  let current: string;
  try {
    [current] = await resolve4(`${subdomain}.duckdns.org`);
  } catch {
    console.log('  Not resolving yet, so there is no address it would be safe to re-send. Token not checked.');
    return;
  }

  try {
    const url = `https://www.duckdns.org/update?domains=${subdomain}&token=${token}&ip=${current}`;
    const body = (await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).text()).trim();
    if (body.startsWith('OK')) console.log(`  Token works. Record left where it was, at ${current}.`);
    else die(`DuckDNS answered "${body}" — either the subdomain or the token is wrong.`);
  } catch {
    console.log('  Could not reach DuckDNS. Carrying on.');
  }
}

// ---------------------------------------------------------------------------
// The keypair and the host key
// ---------------------------------------------------------------------------

function generateKeypair(comment: string): { publicKey: string; privateKeyPath: string } {
  const path = join(OUT, 'deploy_ed25519');

  if (existsSync(path) && !FORCE_KEYGEN) {
    console.log('Reusing the keypair already in .secrets/. Pass --force-keygen to replace it.');
  } else {
    // Removed rather than overwritten: ssh-keygen will not clobber an existing
    // key without asking, and its prompt is not one this script can answer.
    rmSync(path, { force: true });
    rmSync(`${path}.pub`, { force: true });

    const keygen = run('ssh-keygen', ['-t', 'ed25519', '-a', '100', '-N', '', '-C', comment, '-f', path, '-q']);
    if (!keygen.ok) die(`ssh-keygen failed: ${keygen.stderr || keygen.stdout || 'no output'}`);
    console.log('Generated an ed25519 keypair. This one is for CI only — not a key you also use by hand.');
  }

  // 600 on POSIX, near enough a no-op on Windows. Which is why the key is
  // staged in an ignored directory and deleted afterwards, rather than being
  // left to file permissions to protect.
  try {
    chmodSync(path, 0o600);
  } catch {
    // Nothing useful to do about it, and nothing worth failing over.
  }

  return { publicKey: readFileSync(`${path}.pub`, 'utf8').trim(), privateKeyPath: path };
}

/**
 * Every ssh-keyscan worth trying, best first.
 *
 * Windows ships an OpenSSH in System32 that is old enough to fail the key
 * exchange a current Ubuntu offers — it prints `choose_kex: unsupported KEX
 * method sntrup761x25519-sha512@openssh.com`, returns no keys, and *exits
 * zero*. Read only the exit status and it looks exactly like a host that is
 * down, which sends you off checking firewalls on a machine that is answering
 * fine. It has no `-o`, so the key exchange cannot be forced either.
 *
 * Git for Windows ships a current one beside it, and this is a git repository,
 * so it is there.
 */
function keyscanCandidates(): string[] {
  const candidates = ['ssh-keyscan'];
  if (process.platform !== 'win32') return candidates;

  const execPath = run('git', ['--exec-path']).stdout;
  if (execPath !== '') {
    const root = execPath.replace(/\/mingw(?:32|64)\/libexec\/git-core\/?$/i, '');
    candidates.push(join(root, 'usr', 'bin', 'ssh-keyscan.exe'));
  }
  candidates.push('C:/Program Files/Git/usr/bin/ssh-keyscan.exe');
  return candidates;
}

/**
 * `ssh-keyscan` is trust-on-first-use: it reports whatever is answering on that
 * port right now, and it authenticates nothing — no user, no password, no key.
 * Pinning it is only worth anything if you compare it against the fingerprint
 * the provider's console shows, which is why this prints the fingerprints
 * rather than quietly writing the file and moving on.
 *
 * Returns '' when no key could be read. Not fatal: the env file is already
 * written by the time this runs, and it is the half that matters.
 */
function scanHostKey(host: string, port: string): string {
  let keys = '';
  for (const binary of keyscanCandidates()) {
    const scan = run(binary, ['-T', '10', '-p', port, '-H', host]);
    keys = scan.stdout
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'))
      .join('\n');
    if (keys !== '') break;
  }

  if (keys === '') {
    console.log(`\nWarning: could not read a host key from ${host}:${port}.`);
    console.log('  ssh-keyscan does not log in, so this is never a credentials problem. Either nothing is');
    console.log('  listening there, or every ssh-keyscan on PATH is too old for that server. Carrying on');
    console.log('  without DEPLOY_KNOWN_HOSTS.');
    return '';
  }

  const knownHostsPath = join(OUT, 'known_hosts');
  writeFileSync(knownHostsPath, `${keys}\n`, 'utf8');

  console.log("Host key fingerprints. Compare these against your provider's console before trusting them:");
  for (const line of run('ssh-keygen', ['-lf', knownHostsPath]).stdout.split('\n')) console.log(`  ${line}`);

  return keys;
}

// ---------------------------------------------------------------------------
// The env file, rewritten from the example so its comments come along
// ---------------------------------------------------------------------------

function writeEnvFile(answers: Answers): string {
  const example = readFileSync(join(REPO, 'infra', '.env.example'), 'utf8');
  const lines: string[] = [];

  for (const line of example.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (match === null) {
      lines.push(line);
      continue;
    }

    const key = match[1] as EnvKey;
    if (!(ENV_KEYS as readonly string[]).includes(key)) {
      die(
        `infra/.env.example defines ${key}, which this script does not know how to fill in.\n` +
          'Add it to ENV_KEYS and to the prompts in scripts/bootstrap-deploy.ts.',
      );
    }
    lines.push(`${key}=${answers[key]}`);
  }

  // LF, deliberately. This file is written on a laptop and read by a shell on
  // Linux, where a trailing CR would become part of the value — and a token with
  // an invisible character on its end fails in a way nothing explains.
  const path = join(OUT, 'aow5.env');
  writeFileSync(path, lines.join('\n'), 'utf8');
  try {
    chmodSync(path, 0o600);
  } catch {
    // See generateKeypair.
  }

  return path;
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

/**
 * Secrets go to an *environment* rather than to the repository, so the key is
 * reachable only from a job that declares `environment: production` — which is
 * also where a required reviewer or a branch restriction would go. The three
 * variables are not secret (a hostname, a username, a port) and stay at the
 * repository level, where `vars.` reads them without ceremony.
 */
async function applyToGitHub(answers: Answers, privateKey: string, knownHosts: string): Promise<boolean> {
  if (!USE_GH) return false;

  if (!have('gh')) {
    console.log('`gh` is not installed, so the GitHub half is printed below instead of being applied.');
    return false;
  }

  if (!run('gh', ['auth', 'status']).ok) {
    console.log('`gh` is not signed in.');
    if (!(await confirm('Run `gh auth login` now?', true))) return false;
    // Inherited stdio: this one is a conversation, and it may open a browser.
    const login = spawnSync('gh', ['auth', 'login'], { stdio: 'inherit', shell: process.platform === 'win32' });
    if (login.status !== 0) return false;
  }

  const repo = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  if (!repo.ok) {
    console.log('`gh` could not work out which repository this is, so nothing was set.');
    return false;
  }

  console.log(`\nAbout to set, on ${repo.stdout}:`);
  console.log(`  environment ${GH_ENVIRONMENT}, secrets  DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS`);
  console.log(`  repository variables            DEPLOY_HOST=${answers.deployHost}, DEPLOY_USER=${answers.deployUser}, DEPLOY_PORT=${answers.deployPort}`);
  if (!(await confirm('Go ahead?', true))) return false;

  // The environment first: `gh secret set --env` needs it to exist already,
  // and fails with a 404 that reads like a permissions problem when it does not.
  run('gh', ['api', '-X', 'PUT', `repos/${repo.stdout}/environments/${GH_ENVIRONMENT}`, '--silent']);

  // Values arrive on stdin, never as an argv element — an argv element is
  // visible in the process list for as long as the call takes.
  for (const [name, value] of [
    ['DEPLOY_SSH_KEY', privateKey],
    // Skipped rather than set empty when the scan came back with nothing. An
    // empty DEPLOY_KNOWN_HOSTS is worse than an absent one: it looks pinned.
    ['DEPLOY_KNOWN_HOSTS', knownHosts === '' ? '' : `${knownHosts}\n`],
  ] as const) {
    if (value === '') continue;
    const set = run('gh', ['secret', 'set', name, '--env', GH_ENVIRONMENT], value);
    if (!set.ok) die(`gh secret set ${name} failed: ${set.stderr || set.stdout}`);
    console.log(`  set secret ${name}`);
  }

  for (const [name, value] of [
    ['DEPLOY_HOST', answers.deployHost],
    ['DEPLOY_USER', answers.deployUser],
    ['DEPLOY_PORT', answers.deployPort],
  ] as const) {
    const set = run('gh', ['variable', 'set', name, '--body', value]);
    if (!set.ok) die(`gh variable set ${name} failed: ${set.stderr || set.stdout}`);
    console.log(`  set variable ${name}`);
  }

  return true;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Collecting what a deploy needs. Nothing is published, and ctrl-c is safe at any point.');

  if (!have('ssh-keygen')) die('ssh-keygen is not on PATH. Install the OpenSSH client and run this again.');
  prepareOutDir();

  section('The site');
  const subdomain = await askUntil(
    'DuckDNS subdomain (the part before .duckdns.org)',
    /^[a-z0-9][a-z0-9-]{1,61}$/i,
    'Letters, digits and hyphens.',
  );
  const domain = `${subdomain}.duckdns.org`;
  const acmeEmail = await askUntil(
    "Email for Let's Encrypt expiry notices",
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
    'That is not an email address.',
  );

  try {
    const [address] = await resolve4(domain);
    console.log(`  ${domain} resolves to ${address}.`);
  } catch {
    console.log(`  ${domain} does not resolve yet. Point it at the machine before the first deploy: Caddy asks`);
    console.log("  Let's Encrypt for a certificate for exactly this name, and five failures an hour is the budget.");
  }

  section('DuckDNS token');
  console.log('Opening duckdns.org. Sign in and copy the token from the top of the page — it is one token for');
  console.log('the whole account rather than one per subdomain. The refresh timer in infra/systemd/ uses it.');
  openBrowser('https://www.duckdns.org');
  const duckToken = await askUntil('DuckDNS token', /^[0-9a-f-]{30,40}$/i, 'That does not look like a UUID.', {
    secret: true,
  });
  await verifyDuckDns(subdomain, duckToken);

  // Asked for either way: they are how the env file gets to the box, whether
  // or not anything unattended ever connects.
  section('The server');
  const deployHost = await ask('Host to reach it on', domain);
  const deployUser = await ask('User on that host', 'deploy');
  const deployPort = await askUntil('SSH port', /^\d{1,5}$/, 'A port number.', { fallback: '22' });

  const answers: Answers = {
    SITE_DOMAIN: domain,
    ACME_EMAIL: acmeEmail,
    DUCKDNS_SUBDOMAIN: subdomain,
    DUCKDNS_TOKEN: duckToken,
    deployHost,
    deployUser,
    deployPort,
  };

  writeEnvFile(answers);

  let authorizedKeysLine = '';
  let applied = false;
  if (CI_ACCESS) {
    section('CI access');
    const { publicKey, privateKeyPath } = generateKeypair(`github-actions-deploy@${domain}`);
    const knownHosts = scanHostKey(deployHost, deployPort);
    authorizedKeysLine = `restrict ${publicKey}`;
    writeFileSync(join(OUT, 'authorized_keys.line'), `${authorizedKeysLine}\n`, 'utf8');
    applied = await applyToGitHub(answers, readFileSync(privateKeyPath, 'utf8'), knownHosts);
  }

  stillAsking = false;
  rl.close();

  // -------------------------------------------------------------------------

  const dir = relative(REPO, OUT).replaceAll('\\', '/');
  section('What is left to do by hand');

  console.log(`\n1. The env file. ${dir}/aow5.env is infra/.env.example with your values in it:\n`);
  console.log(`     scp -P ${deployPort} ${dir}/aow5.env ${deployUser}@${deployHost}:/srv/aow5/.env`);
  console.log(`     ssh -p ${deployPort} ${deployUser}@${deployHost} chmod 600 /srv/aow5/.env`);
  console.log('\n   Accounts are local, so nothing in here is a key to somebody else’s service — it is the');
  console.log('   domain, the ACME contact and the DuckDNS token. The site works once it is there and');
  console.log('   infra/deploy.sh has run.');

  console.log('\n2. Deploy:\n');
  console.log(`     ssh -p ${deployPort} ${deployUser}@${deployHost}`);
  console.log('     cd /srv/aow5/repo && git pull && infra/deploy.sh');

  if (CI_ACCESS) {
    console.log(`\n3. The public key, from ${dir}/authorized_keys.line:\n`);
    console.log(`     ssh -p ${deployPort} ${deployUser}@${deployHost} \\`);
    console.log(`       "umask 077; mkdir -p ~/.ssh; echo '${authorizedKeysLine}' >> ~/.ssh/authorized_keys"`);
    console.log('\n   `restrict` turns off port forwarding, agent forwarding and a pty, none of which a deploy');
    console.log('   needs. It is still a shell on a box in the docker group; a forced command wrapping');
    console.log('   infra/deploy.sh is the next step up, once there is a workflow to shape it around.');

    if (applied) {
      console.log('\n4. GitHub is done. Add a required reviewer to the environment if you want an approval gate.');
    } else {
      console.log('\n4. GitHub, under Settings -> Secrets and variables -> Actions:\n');
      console.log(`     environment ${GH_ENVIRONMENT}, secret DEPLOY_SSH_KEY       ${dir}/deploy_ed25519 (the whole file)`);
      console.log(`     environment ${GH_ENVIRONMENT}, secret DEPLOY_KNOWN_HOSTS   ${dir}/known_hosts`);
      console.log(`     repository variable DEPLOY_HOST                 ${deployHost}`);
      console.log(`     repository variable DEPLOY_USER                 ${deployUser}`);
      console.log(`     repository variable DEPLOY_PORT                 ${deployPort}`);
    }
  } else {
    console.log('\nNo CI keypair was generated. Nothing in .github/workflows/ deploys anything — deploy.sh is');
    console.log('run by hand — so a key in GitHub would be a credential with no job. Re-run with --ci the day');
    console.log('that changes.');
  }

  console.log(`\nEverything above is in ${dir}/ and is gitignored. Delete it once it has landed.`);
}

await main();
