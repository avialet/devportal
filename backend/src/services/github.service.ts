import { buildDomain, type EnvName } from '@devportal/shared';

const GITHUB_API = 'https://api.github.com';

async function ghRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }

  return res.json();
}

export interface GitHubOrg {
  login: string;
  avatar_url: string;
  description: string | null;
}

export interface GitHubRepo {
  full_name: string;
  html_url: string;
  name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  owner: { login: string };
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
}

/**
 * Get the authenticated user
 */
export async function getUser(token: string): Promise<GitHubUser> {
  return ghRequest<GitHubUser>('/user', token);
}

/**
 * List organizations the user belongs to
 */
export async function listOrgs(token: string): Promise<GitHubOrg[]> {
  return ghRequest<GitHubOrg[]>('/user/orgs?per_page=100', token);
}

/**
 * List repos for an org or the authenticated user
 */
export async function listRepos(token: string, org?: string): Promise<GitHubRepo[]> {
  if (org) {
    return ghRequest<GitHubRepo[]>(`/orgs/${org}/repos?per_page=100&sort=updated&direction=desc`, token);
  }
  return ghRequest<GitHubRepo[]>('/user/repos?per_page=100&sort=updated&direction=desc&affiliation=owner', token);
}

/**
 * Create a new repository (under org or user)
 */
export async function createRepo(
  token: string,
  name: string,
  options: { org?: string; description?: string; isPrivate?: boolean } = {}
): Promise<GitHubRepo> {
  const body: Record<string, unknown> = {
    name,
    description: options.description ?? '',
    private: options.isPrivate ?? true,
    auto_init: true, // creates initial commit with README
  };

  const path = options.org ? `/orgs/${options.org}/repos` : '/user/repos';
  return ghRequest<GitHubRepo>(path, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Get the SHA of a branch's HEAD
 */
async function getBranchSha(token: string, owner: string, repo: string, branch: string): Promise<string> {
  const ref = await ghRequest<{ object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    token
  );
  return ref.object.sha;
}

/**
 * Create a branch from another branch
 */
export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  fromBranch: string
): Promise<void> {
  const sha = await getBranchSha(token, owner, repo, fromBranch);
  await ghRequest(`/repos/${owner}/${repo}/git/refs`, token, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
  });
}

/**
 * Check if a branch exists
 */
export async function branchExists(token: string, owner: string, repo: string, branch: string): Promise<boolean> {
  try {
    await ghRequest(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Update a file in a repo (create or update)
 */
async function updateFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
  };
  if (sha) body.sha = sha;

  await ghRequest(`/repos/${owner}/${repo}/contents/${path}`, token, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Generate a README.md for a new project
 */
function generateReadme(name: string, description?: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const devDomain = buildDomain(slug, 'development' as EnvName);
  const stagingDomain = buildDomain(slug, 'staging' as EnvName);
  const prodDomain = buildDomain(slug, 'production' as EnvName);

  return `# ${name}

${description || `Projet ${name} gere par DevPortal.`}

## Environnements

| Environnement | Branche | URL |
|--------------|---------|-----|
| Development | \`dev\` | https://${devDomain} |
| Staging | \`staging\` | https://${stagingDomain} |
| Production | \`main\` | https://${prodDomain} |

## Workflow

- **dev** : deploiement automatique a chaque push
- **staging** : deploiement automatique a chaque push
- **production** : deploiement manuel via DevPortal

## Getting Started

\`\`\`bash
git clone <repo-url>
cd ${slug}
npm install
npm run dev
\`\`\`
`;
}

/**
 * Create repo with dev + staging + main branches and a pre-filled README.
 * auto_init creates 'main' branch with a default README.
 * We then update the README with project info, and create dev + staging branches.
 */
export async function createRepoWithBranches(
  token: string,
  name: string,
  options: { org?: string; description?: string; isPrivate?: boolean } = {}
): Promise<GitHubRepo> {
  const repo = await createRepo(token, name, options);
  const owner = repo.owner.login;

  // Wait for GitHub to finish auto_init
  await new Promise(r => setTimeout(r, 2000));

  const mainBranch = repo.default_branch || 'main';

  // Update README with project info
  try {
    // Get existing README SHA
    const existing = await ghRequest<{ sha: string }>(
      `/repos/${owner}/${repo.name}/contents/README.md?ref=${mainBranch}`,
      token
    );
    await updateFile(
      token, owner, repo.name,
      'README.md',
      generateReadme(name, options.description),
      'docs: initialize project README with environment info',
      mainBranch,
      existing.sha
    );
  } catch {
    // README doesn't exist yet, create it
    await updateFile(
      token, owner, repo.name,
      'README.md',
      generateReadme(name, options.description),
      'docs: initialize project README with environment info',
      mainBranch
    );
  }

  // Create dev and staging branches from main
  for (const branch of ['dev', 'staging']) {
    const exists = await branchExists(token, owner, repo.name, branch);
    if (!exists) {
      await createBranch(token, owner, repo.name, branch, mainBranch);
    }
  }

  return repo;
}

/**
 * Generate a GitHub Actions workflow YAML for Coolify auto-deploy
 */
export function generateCoolifyWorkflow(
  coolifyApiUrl: string,
  devUuid?: string | null,
  stagingUuid?: string | null,
  prodUuid?: string | null
): string {
  const branches: string[] = [];
  if (devUuid) branches.push('dev');
  if (stagingUuid) branches.push('staging');
  if (prodUuid) branches.push('main');

  const makeStep = (label: string, branch: string, uuid: string) =>
    `      - name: Deploy ${label}
        if: github.ref_name == '${branch}'
        run: |
          curl -sf -X GET "${coolifyApiUrl}/deploy?uuid=${uuid}&force=true" \\
            -H "Authorization: Bearer \${{ secrets.COOLIFY_TOKEN }}" || echo "deploy non-bloquant"`;

  const steps = [
    devUuid ? makeStep('DEV', 'dev', devUuid) : null,
    stagingUuid ? makeStep('STAGING', 'staging', stagingUuid) : null,
    prodUuid ? makeStep('PROD', 'main', prodUuid) : null,
  ].filter(Boolean).join('\n');

  return `name: Deploy via Coolify

on:
  push:
    branches: [${branches.map(b => `'${b}'`).join(', ')}]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${steps}
`;
}

/**
 * Create the CI workflow file in the repo (on main branch)
 */
export async function createWorkflowFile(
  token: string,
  owner: string,
  repo: string,
  coolifyApiUrl: string,
  devUuid?: string | null,
  stagingUuid?: string | null,
  prodUuid?: string | null
): Promise<void> {
  const content = generateCoolifyWorkflow(coolifyApiUrl, devUuid, stagingUuid, prodUuid);
  try {
    await updateFile(token, owner, repo, '.github/workflows/deploy.yml', content,
      'ci: add Coolify auto-deploy workflow', 'main');
  } catch (err: any) {
    console.error('[GitHub] Workflow file error:', err.message);
  }
}

/**
 * Validate a GitHub token by calling /user
 */
export async function validateToken(token: string): Promise<{ valid: boolean; login?: string; error?: string }> {
  try {
    const user = await getUser(token);
    return { valid: true, login: user.login };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

/**
 * Add an SSH deploy key to a GitHub repository.
 * Returns true if added, false if already exists or failed.
 */
export async function addDeployKey(
  token: string,
  owner: string,
  repo: string,
  publicKey: string,
  title = 'Coolify Deploy Key'
): Promise<boolean> {
  try {
    await ghRequest(`/repos/${owner}/${repo}/keys`, token, {
      method: 'POST',
      body: JSON.stringify({ title, key: publicKey, read_only: true }),
    });
    return true;
  } catch (err: any) {
    // 422 = key already exists
    if (err.message?.includes('422')) return true;
    console.warn(`[GitHub] Failed to add deploy key to ${owner}/${repo}:`, err.message);
    return false;
  }
}

/**
 * Check if a GitHub repo is private
 */
export async function isRepoPrivate(token: string, owner: string, repo: string): Promise<boolean> {
  try {
    const data = await ghRequest<{ private: boolean }>(`/repos/${owner}/${repo}`, token);
    return data.private;
  } catch {
    return false;
  }
}
