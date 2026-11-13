import type {AgentApiRewrite} from './proxy';
/** Retired direct Console proxy: even legacy configuration must not reopen the bypass. */
export function resolveMcpRewrites(_env:Readonly<Record<string,string|undefined>>):AgentApiRewrite[]{
 void _env;return [];
}
