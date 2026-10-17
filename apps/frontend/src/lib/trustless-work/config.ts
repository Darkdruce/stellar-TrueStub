/**
 * TrustlessWork SDK Configuration
 *
 * This file contains configuration settings for the TrustlessWork escrow SDK.
 * It handles environment-specific settings and API configuration.
 *
 * @see https://docs.trustlesswork.com/trustless-work/react-library-hooks/getting-started
 */

import type { TrustlessWorkConfigOptions } from './types';

/**
 * Environment URLs for TrustlessWork API
 */
export const TRUSTLESS_WORK_API_URLS = {
  production: 'https://api.trustlesswork.com',
  development: 'https://dev.api.trustlesswork.com',
} as const;

/**
 * Resolve the Stellar network used by the frontend.
 *
 * This is the single source of truth for the frontend's network value and is
 * read consistently from `NEXT_PUBLIC_TRUSTLESS_NETWORK`. It defaults to
 * `testnet` in development and `mainnet` otherwise, matching the historical
 * behavior of {@link getTrustlessWorkConfig}.
 *
 * The resolved value is exported so that startup/deploy-time checks can
 * cross-validate it against the backend's `STELLAR_NETWORK` (see
 * `resolveFrontendNetwork` / `assertNetworkMatchesBackend` below).
 *
 * @returns {'testnet' | 'mainnet'} The resolved frontend network
 */
export function resolveFrontendNetwork(): 'testnet' | 'mainnet' {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const configured = process.env.NEXT_PUBLIC_TRUSTLESS_NETWORK;

  if (configured === 'testnet' || configured === 'mainnet') {
    return configured;
  }

  if (configured) {
    console.warn(
      `TrustlessWork: Unrecognized NEXT_PUBLIC_TRUSTLESS_NETWORK value "${configured}". ` +
        `Expected "testnet" or "mainnet". Falling back to the environment default.`
    );
  }

  return isDevelopment ? 'testnet' : 'mainnet';
}

/**
 * Get the TrustlessWork configuration from environment variables
 *
 * @returns {TrustlessWorkConfigOptions} Configuration object for TrustlessWork
 * @throws {Error} If required environment variables are missing
 */
export function getTrustlessWorkConfig(): TrustlessWorkConfigOptions {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY || '';
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Determine the base URL based on environment
  const baseURL = isDevelopment
    ? (process.env.NEXT_PUBLIC_TRUSTLESS_API_URL_DEV || TRUSTLESS_WORK_API_URLS.development)
    : (process.env.NEXT_PUBLIC_TRUSTLESS_API_URL || TRUSTLESS_WORK_API_URLS.production);

  // Get the network configuration (defaults to testnet in development)
  const network = resolveFrontendNetwork();

  if (!apiKey) {
    console.warn(
      'TrustlessWork API key is missing. Please set NEXT_PUBLIC_API_KEY in your .env file.'
    );
  }

  return {
    baseURL,
    apiKey: apiKey || '',
    network,
  };
}

/**
 * Validate TrustlessWork configuration
 *
 * @param {TrustlessWorkConfigOptions} config - Configuration to validate
 * @returns {boolean} True if configuration is valid
 */
export function validateTrustlessWorkConfig(
  config: TrustlessWorkConfigOptions
): boolean {
  if (!config.apiKey) {
    console.error('TrustlessWork: API key is required');
    return false;
  }

  if (!config.baseURL) {
    console.error('TrustlessWork: Base URL is required');
    return false;
  }

  // Validate URL format
  try {
    new URL(config.baseURL);
  } catch (error) {
    console.error('TrustlessWork: Invalid base URL format');
    return false;
  }

  return true;
}

/**
 * Assert that the frontend network configuration agrees with the backend's
 * `STELLAR_NETWORK` value.
 *
 * Both services configure testnet vs. mainnet independently, so a mismatch
 * (e.g. frontend on testnet while the backend submits refunds on mainnet)
 * would be a serious and confusing production issue. This helper is intended
 * to be called from a startup/deploy-time check so such a mismatch is caught
 * automatically rather than discovered in production.
 *
 * @param {string | undefined} backendNetwork - The backend's STELLAR_NETWORK value
 * @param {'testnet' | 'mainnet'} [frontendNetwork] - Optional override; defaults to the resolved frontend network
 * @returns {'testnet' | 'mainnet'} The validated, matching network
 * @throws {Error} If the backend network is missing, unrecognized, or mismatched
 */
export function assertNetworkMatchesBackend(
  backendNetwork: string | undefined,
  frontendNetwork: 'testnet' | 'mainnet' = resolveFrontendNetwork()
): 'testnet' | 'mainnet' {
  const normalizedBackend = backendNetwork?.trim().toLowerCase();

  if (!normalizedBackend) {
    throw new Error(
      'Network configuration error: backend STELLAR_NETWORK is not set. ' +
        `Frontend is configured for "${frontendNetwork}".`
    );
  }

  if (normalizedBackend !== 'testnet' && normalizedBackend !== 'mainnet') {
    throw new Error(
      `Network configuration error: backend STELLAR_NETWORK has unrecognized value ` +
        `"${backendNetwork}". Expected "testnet" or "mainnet".`
    );
  }

  if (normalizedBackend !== frontendNetwork) {
    throw new Error(
      `Network configuration mismatch: frontend NEXT_PUBLIC_TRUSTLESS_NETWORK is ` +
        `"${frontendNetwork}" but backend STELLAR_NETWORK is "${normalizedBackend}". ` +
        'Both services must target the same Stellar network.'
    );
  }

  return frontendNetwork;
}

/**
 * Export commonly used constants
 */
export const TRUSTLESS_WORK_CONSTANTS = {
  /**
   * API URLs
   */
  API_URLS: TRUSTLESS_WORK_API_URLS,

  /**
   * Escrow types
   */
  ESCROW_TYPES: {
    SINGLE_RELEASE: 'single-release' as const,
    MULTI_RELEASE: 'multi-release' as const,
  },

  /**
   * Network types
   */
  NETWORKS: {
    TESTNET: 'testnet' as const,
    MAINNET: 'mainnet' as const,
  },

  /**
   * Escrow statuses
   */
  ESCROW_STATUSES: {
    WORKING: 'working' as const,
    PENDING_RELEASE: 'pendingRelease' as const,
    RELEASED: 'released' as const,
    RESOLVED: 'resolved' as const,
    IN_DISPUTE: 'inDispute' as const,
  },

  /**
   * Request statuses
   */
  REQUEST_STATUSES: {
    SUCCESS: 'SUCCESS' as const,
    FAILED: 'FAILED' as const,
  },
} as const;
