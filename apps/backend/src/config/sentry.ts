/**
 * Sentry initialisation for the TrueStub backend (Express / Node.js).
 *
 * Call `initSentry()` once at process start — before any routes are wired —
 * so that the Sentry request handler and error handler can be attached to
 * the Express app.
 *
 * Usage in index.ts:
 *   import { initSentry, sentryRequestHandler, sentryErrorHandler } from './config/sentry';
 *   initSentry();
 *   // then: app.use(sentryRequestHandler()); before routes
 *   // then: app.use(sentryErrorHandler()); before the custom errorHandler
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/express/
 */
import * as Sentry from "@sentry/node";
import { env } from "./env";

/**
 * Tag key used to mark events that belong to the escrow-status webhook
 * integration.  Alert rules in Sentry can filter on this tag so that
 * unmapped-status 400s raise a dedicated alert instead of being buried in
 * generic error noise.
 */
export const ESCROW_STATUS_WEBHOOK_TAG = "escrow_status_webhook";

export function initSentry(): void {
  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    // No DSN configured — Sentry is a no-op.  This is fine for local dev.
    return;
  }

  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    // Capture 10 % of transactions for performance monitoring.
    tracesSampleRate: 0.1,
    // Ensure the environment tag is always attached so alert rules scoped to
    // a specific environment (e.g. production) fire correctly.
    initialScope: {
      tags: {
        environment: env.NODE_ENV,
      },
    },
  });
}

/**
 * Sentry Express request handler — must be added BEFORE routes.
 * Returns a no-op middleware when Sentry is not initialised.
 */
export const sentryRequestHandler: typeof Sentry.Handlers.requestHandler =
  Sentry.Handlers.requestHandler;

/**
 * Sentry Express error handler — must be added AFTER routes but BEFORE the
 * custom `errorHandler` middleware so Sentry captures the raw error.
 * Returns a no-op middleware when Sentry is not initialised.
 */
export const sentryErrorHandler: typeof Sentry.Handlers.errorHandler =
  Sentry.Handlers.errorHandler;
