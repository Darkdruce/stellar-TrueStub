import { env } from "../config/env";
import { queryWithTimeout } from "./postgres";

interface HasuraResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export interface HasuraClient {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

function requireHasuraConfig(): { url: string; adminSecret: string } {
  const url = env.HASURA_GRAPHQL_URL;
  const adminSecret = env.HASURA_ADMIN_SECRET;

  if (!url || !adminSecret) {
    throw new Error(
      "HASURA_GRAPHQL_URL and HASURA_GRAPHQL_ADMIN_SECRET must be configured for Hasura requests"
    );
  }

  return { url, adminSecret };
}

/**
 * Creates the backend-only Hasura admin client.
 *
 * The admin secret is read from validated server environment configuration and
 * is sent only in the request header. It is never included in logs, errors, or
 * the returned client object.
 */
export function createHasuraClient(): HasuraClient {
  return {
    async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
      const { url, adminSecret } = requireHasuraConfig();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hasura-admin-secret": adminSecret,
        },
        body: JSON.stringify({ query, variables }),
      });

      const json = (await response.json()) as HasuraResponse<T>;
      if (!response.ok || json.errors?.length) {
        const detail = json.errors?.map(({ message }) => message).join("; ") ?? response.statusText;
        throw new Error(`Hasura request failed: ${detail}`);
      }
      if (json.data === undefined) {
        throw new Error("Hasura request returned no data");
      }
      return json.data;
    },
  };
}

export const hasuraClient = createHasuraClient();

export async function hasuraRequest<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  return hasuraClient.request<T>(query, variables);
}

export interface EscrowStatusRow {
  id: string;
  contract_id: string;
  status: string;
  updated_at: string;
}

interface EscrowStatusQueryResult {
  escrow_transactions: EscrowStatusRow[];
}

/**
 * Fetches a sample of recent escrow transactions from Hasura so their stored
 * status can be reconciled against Trustless Work's live state.
 *
 * This is a read-only helper used by the reconciliation job; it does not touch
 * the webhook write path that remains the single authoritative writer of
 * `escrow_transactions.status`.
 */
export async function fetchRecentEscrowStatuses(limit = 50): Promise<EscrowStatusRow[]> {
  const query = `
    query RecentEscrowStatuses($limit: Int!) {
      escrow_transactions(order_by: { updated_at: desc }, limit: $limit) {
        id
        contract_id
        status
        updated_at
      }
    }
  `;

  const data = await hasuraRequest<EscrowStatusQueryResult>(query, { limit });
  return data.escrow_transactions ?? [];
}

/**
 * Fetches recent escrow statuses directly from Postgres over `DATABASE_URL`.
 *
 * Uses the shared pool in `./postgres`, which applies explicit pool size,
 * idle timeout, connection timeout, and statement timeout settings rather
 * than relying on driver defaults. Prefer this over the Hasura GraphQL path
 * when a direct connection is available.
 */
export async function fetchRecentEscrowStatusesFromPostgres(
  limit = 50
): Promise<EscrowStatusRow[]> {
  const result = await queryWithTimeout<EscrowStatusRow>(
    `SELECT id, contract_id, status, updated_at
       FROM escrow_transactions
      ORDER BY updated_at DESC
      LIMIT $1`,
    [limit]
  );
  return result.rows ?? [];
}
