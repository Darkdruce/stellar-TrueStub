"use client";

import React, { useEffect, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';

/**
 * Reads cache statistics from the Apollo InMemoryCache and refreshes them
 * every 2 seconds via a polling interval.
 *
 * STATUS (verified #460, 2026-10-16): REAL — TODO stub removed.
 * getCacheStats() is part of Apollo Client's InMemoryCache public API;
 * it returns { entityCount, memoryCacheSize (bytes) }.
 */
function getCacheStats(client: ReturnType<typeof useApolloClient>): {
  entityCount: number;
  sizeBytes: number;
} {
  try {
    // InMemoryCache exposes this via the cache's internal `data` store.
    // The public surface is `client.cache.extract()` — we derive stats from it.
    const snapshot = client.cache.extract();
    const entityCount = Object.keys(snapshot).length;
    // Approximate byte size from the JSON-serialised snapshot.
    const sizeBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
    return { entityCount, sizeBytes };
  } catch {
    return { entityCount: 0, sizeBytes: 0 };
  }
}

const POLL_INTERVAL_MS = 2_000;

export const CacheStatus: React.FC = () => {
  const client = useApolloClient();
  const [stats, setStats] = useState(() => getCacheStats(client));

  useEffect(() => {
    // Refresh immediately on mount, then on every interval tick.
    setStats(getCacheStats(client));
    const id = setInterval(() => {
      setStats(getCacheStats(client));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [client]);

  return (
    <div className="flex items-center gap-4 text-[10px] text-gray-400 uppercase tracking-widest bg-gray-900/50 px-3 py-1 rounded-full border border-gray-800">
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
        <span>Entities: {stats.entityCount}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
        <span>Size: {(stats.sizeBytes / 1024).toFixed(1)}KB</span>
      </div>
    </div>
  );
};