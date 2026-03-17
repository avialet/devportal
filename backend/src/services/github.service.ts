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
 * Create repo with dev + staging + main branches.
 * auto_init creates 'main' branch automatically.
 * We then create 'dev' and 'staging' from main.
 */
export async function createRepoWithBranches(
  token: string,
  name: string,
  options: { org?: string; description?: string; isPrivate?: boolean } = {}
): Promise<GitHubRepo> {
  const repo = await createRepo(token, name, options);
  const owner = repo.owner.login;

  // Wait a moment for GitHub to finish auto_init
  await new Promise(r => setTimeout(r, 2000));

  // Ensure main exists (it should from auto_init)
  const mainBranch = repo.default_branch || 'main';

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
