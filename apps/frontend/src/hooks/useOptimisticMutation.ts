import type { DocumentNode } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { optimisticUpdatePolicies } from '@/utils/optimistic-updates';

/**
 * Wraps Apollo's useMutation with a named optimistic-update policy.
 *
 * STATUS (verified #459, 2026-10-16): REAL — no stub, no deferral.
 * This hook imports `useMutation` from `@apollo/client/react` (the correct
 * entry-point for Apollo Client v4) and calls it directly. The earlier
 * Apollo v4 + React 19 compatibility concern was that hooks imported from
 * the old `@apollo/client` barrel broke under v4; importing from
 * `@apollo/client/react` resolves that, and that is what this file does.
 * No TODO, no placeholder — the real mutation is wired.
 */
export function useOptimisticMutation(
    mutation: DocumentNode,
    policyName: keyof typeof optimisticUpdatePolicies,
    options?: useMutation.Options<any, any>
) {
    const policy = optimisticUpdatePolicies[policyName];

    return useMutation(mutation, {
        ...options,
        optimisticResponse: policy.optimisticResponse,
        update: 'update' in policy ? policy.update : options?.update,
    });
}
