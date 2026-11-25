export interface JobsEnv {
  JOBS_SUPABASE_URL: string;
  JOBS_SUPABASE_SERVICE_ROLE_KEY: string;
}

/**
 * Scheduled integrity & maintenance runner (MONITORING.md, AUTHORIZATION_RBAC_RLS.md §4).
 * Iterates organizations explicitly and verifies per-organization audit hash chains.
 */
export async function runNightlyIntegritySweep(env: JobsEnv): Promise<{
  checkedOrgs: number;
  brokenOrgs: string[];
}> {
  const base = env.JOBS_SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    apikey: env.JOBS_SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.JOBS_SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  const orgRes = await fetch(`${base}/rest/v1/organizations?select=id&status=eq.active`, {
    headers,
  });
  if (!orgRes.ok) {
    throw new Error(`Failed to list organizations: ${orgRes.status}`);
  }
  const orgs = (await orgRes.json()) as Array<{ id: string }>;
  const brokenOrgs: string[] = [];

  for (const org of orgs) {
    const verifyRes = await fetch(`${base}/rest/v1/rpc/rpc_verify_audit_chain`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_org_id: org.id }),
    });
    if (!verifyRes.ok) {
      brokenOrgs.push(org.id);
      continue;
    }
    const valid = (await verifyRes.json()) as boolean;
    if (!valid) {
      brokenOrgs.push(org.id);
    }
  }

  return { checkedOrgs: orgs.length, brokenOrgs };
}

export default {
  async scheduled(_controller: ScheduledController, env: JobsEnv): Promise<void> {
    const result = await runNightlyIntegritySweep(env);
    if (result.brokenOrgs.length > 0) {
      // Log only non-sensitive org UUIDs for Sev 1 alerting (no secrets/payloads)
      console.error('SEV1_INTEGRITY_BREAK', JSON.stringify(result));
    }
  },
};
