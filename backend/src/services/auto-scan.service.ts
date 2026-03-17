import { queryOne } from '../db/database.js';
import * as coolify from './coolify.service.js';
import { startScanBackground } from './scanner.service.js';

interface DbProject {
  id: number;
  dev_app_uuid: string | null;
  staging_app_uuid: string | null;
  prod_app_uuid: string | null;
}

export async function triggerAutoScan(appUuid: string, userId: number | null): Promise<void> {
  // Find which project and environment this app belongs to
  const project = queryOne<DbProject>(
    'SELECT id, dev_app_uuid, staging_app_uuid, prod_app_uuid FROM portal_projects WHERE dev_app_uuid = ? OR staging_app_uuid = ? OR prod_app_uuid = ?',
    [appUuid, appUuid, appUuid]
  );

  if (!project) return; // Not a portal-managed project

  let environment = '';
  if (project.dev_app_uuid === appUuid) environment = 'development';
  else if (project.staging_app_uuid === appUuid) environment = 'staging';
  else if (project.prod_app_uuid === appUuid) environment = 'production';

  if (!environment) return;

  // Check if auto-scan is enabled for this environment
  const config = queryOne<{ tool: string; enabled: number }>(
    'SELECT tool, enabled FROM project_scan_config WHERE project_id = ? AND environment = ?',
    [project.id, environment]
  );

  if (!config || !config.enabled) return;

  // Get the app's FQDN
  try {
    const app = await coolify.getApplication(appUuid);
    if (!app.fqdn) return;

    const targetUrl = app.fqdn.split(',')[0].trim(); // Take first URL if multiple

    // Wait a bit for the app to be ready (deploy just started)
    console.log(`[auto-scan] Will scan ${targetUrl} (${environment}) in 90s...`);
    setTimeout(async () => {
      try {
        await startScanBackground(targetUrl, config.tool as any, userId, project.id);
        console.log(`[auto-scan] Scan started for ${targetUrl}`);
      } catch (err) {
        console.error(`[auto-scan] Failed to start scan:`, err);
      }
    }, 90000); // 90 seconds delay for app to be ready
  } catch (err) {
    console.error('[auto-scan] Error getting app info:', err);
  }
}
