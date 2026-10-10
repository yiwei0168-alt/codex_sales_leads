export const LOCAL_AGENT_REPLAY_TIMEOUT_MS=120000;
export class LocalReplayError extends Error {
  constructor(public readonly code:'local-timeout'|'local-transport'|'local-http'|'local-json'|'local-incomplete'|'local-schema') {super(code);}
}
