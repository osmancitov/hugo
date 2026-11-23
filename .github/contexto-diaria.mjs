// Identidad operativa de la corrida, no es una conversación ni envía mensajes a Slack.
export function eventoDiaria(entorno=process.env) {
  return {channel:'github-actions',ts:`diaria-${entorno.GITHUB_RUN_ID||'local'}-${entorno.GITHUB_RUN_ATTEMPT||'1'}`};
}
