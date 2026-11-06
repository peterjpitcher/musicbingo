import { createErrorReporter } from "@anchor-nights/kit/errors";

/**
 * Records a technical failure: a redacted console line always, and a report to
 * app/api/errors (stored in public.app_errors) when ERROR_SINK_URL and
 * ERROR_SINK_TOKEN are set. Never throws, and gives up on a slow sink after two
 * seconds, so it is safe in any catch block. Server only.
 *
 *   await reportError({ scope: "api:sessions:list" }, err);
 */
export const reportError = createErrorReporter({ app: "music-bingo" });
