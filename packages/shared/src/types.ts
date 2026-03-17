export interface User {
  id: number;
  email: string;
  displayName: string;
  role: 'admin' | 'developer';
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface PortalProject {
  id: number;
  name: string;
  coolifyProjectUuid: string;
  githubUrl: string;
  createdBy: number;
  devAppUuid: string | null;
  stagingAppUuid: string | null;
  prodAppUuid: string | null;
  devMonitorId: number | null;
  stagingMonitorId: number | null;
  prodMonitorId: number | null;
  createdAt: string;
}

export interface CoolifyApplication {
  uuid: string;
  name: string;
  fqdn: string | null;
  status: string;
  git_repository: string;
  git_branch: string;
  build_pack: string;
  description: string | null;
}

export interface Environment {
  name: 'development' | 'staging' | 'production';
  app: CoolifyApplication | null;
  domain: string;
  monitorId: number | null;
  monitorStatus: 'up' | 'down' | 'pending' | 'unknown';
}

export interface ProjectDetail extends PortalProject {
  environments: Environment[];
}

export interface CreateProjectRequest {
  name: string;
  githubUrl: string;
  gitBranch?: string;
  portsExposes?: string;
}

export interface WizardStep {
  step: number;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

export interface DeploymentLog {
  uuid: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  commit: string | null;
  logs: string;
}

export interface MonitorStatus {
  monitorId: number;
  name: string;
  status: 'up' | 'down' | 'pending';
  ping: number | null;
  uptime24h: number | null;
}

export interface ApiError {
  error: string;
  message: string;
}

// --- Security Scanner ---

export type ScanTool = 'nuclei' | 'zap-baseline' | 'zap-full';
export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface FindingsSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface SecurityScan {
  id: string;
  projectId: number | null;
  targetUrl: string;
  tool: ScanTool;
  status: ScanStatus;
  startedAt: string | null;
  finishedAt: string | null;
  reportPath: string | null;
  findingsSummary: FindingsSummary | null;
  error: string | null;
  triggeredBy: number;
  createdAt: string;
}

export interface StartScanRequest {
  targetUrl: string;
  tool: ScanTool;
  projectId?: number;
}

export interface ScanProgressEvent {
  type: 'progress' | 'complete' | 'error';
  scanId: string;
  message?: string;
  findingsSummary?: FindingsSummary;
}
