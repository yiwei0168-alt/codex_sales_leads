import { MODE_MODEL_MAX_OUTPUT_TOKENS } from '../../assistant/main/model';
import { modeConfigSchema } from '../../assistant/main/mode-config';
import { billingPolicy, quoteRequest, type RequestBound } from '../../billing/policy';
import type { Ma24G15Preview } from './ma24-g15-runtime-binding';

const openRouterOrigin = 'https://openrouter.ai';
const chatPath = '/api/v1/chat/completions';

/** Check every possible mode fallback before a persisted evaluation task is claimed. */
export function assertMa24G15TariffCoverage(preview: Ma24G15Preview,
  now = Date.now(), rules: RequestBound[] = billingPolicy.rules) {
  const profile = modeConfigSchema.parse(preview.modelProfile);
  if (profile.mode !== 'standard' ||
    !Number.isSafeInteger(preview.maximumRequestBytes) ||
    (preview.maximumRequestBytes ?? 0) <= 0 ||
    !Number.isSafeInteger(preview.maximumOutputTokens) ||
    (preview.maximumOutputTokens ?? 0) < MODE_MODEL_MAX_OUTPUT_TOKENS)
    throw new Error('MA24 G15 model tariff request bounds unavailable');
  return profile.routes.map(route => {
    const rule = quoteRequest({
      origin: openRouterOrigin, pathname: chatPath, model: route.model,
      requestBytes: preview.maximumRequestBytes!,
      outputTokens: MODE_MODEL_MAX_OUTPUT_TOKENS,
    }, rules, now);
    if (rule.requestContract)
      throw new Error('MA24 G15 model tariff contract differs from mode stream');
    return rule.key;
  });
}
