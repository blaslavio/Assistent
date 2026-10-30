// OpenAI Responses naar het bestaande berichtenprotocol van de assistent.
// Sleutels blijven op de server; de app behoudt zijn eigen hulpmiddelen en bevestigingen.
type Obj = Record<string, any>;

export function openaiVerzoek(body: Obj, model: string) {
  const input: Obj[] = [];
  for (const m of body.messages ?? []) {
    if (!["user", "assistant"].includes(m.role)) throw new Error("Onbekende berichtrol.");
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    let content: Obj[] = [];
    const flush = () => { if (content.length) input.push({ role: m.role, content }); content = []; };
    for (const b of blocks ?? []) {
      if (b.type === "text") content.push({ type: m.role === "assistant" ? "output_text" : "input_text", text: b.text });
      else if (b.type === "tool_use") {
        flush(); input.push({ type: "function_call", call_id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) });
      } else if (b.type === "tool_result") {
        flush(); input.push({ type: "function_call_output", call_id: b.tool_use_id,
          output: typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "") });
      } else if (b.type === "image" && b.source?.type === "base64") {
        content.push({ type: "input_image", image_url: `data:${b.source.media_type};base64,${b.source.data}` });
      } else if (b.type === "document" && b.source?.type === "base64") {
        content.push({ type: "input_file", filename: b.title || "bestand.pdf",
          file_data: `data:${b.source.media_type};base64,${b.source.data}` });
      } else throw new Error("Dit bericht bevat een onderdeel dat ChatGPT nog niet kan openen. Begin een nieuw gesprek.");
    }
    flush();
  }
  const tools: Obj[] = (body.tools ?? []).filter((t: Obj) => t.input_schema).map((t: Obj) => ({
    type: "function", name: t.name, description: t.description, parameters: t.input_schema, strict: false,
  }));
  if ((body.tools ?? []).some((t: Obj) => t.name === "web_search")) tools.push({ type: "web_search" });
  const instructions = typeof body.system === "string" ? body.system
    : (body.system ?? []).filter((b: Obj) => b.type === "text").map((b: Obj) => b.text).join("\n\n");
  const effort = body.output_config?.effort;
  return { model, store: false, instructions, input, tools, max_output_tokens: Math.min(Math.max(Number(body.max_tokens) || 4096, 256), 16000),
    reasoning: { effort: ["low", "medium", "high"].includes(effort) ? effort : "low" } };
}

export function openaiBericht(response: Obj, requestedModel: string) {
  const content: Obj[] = [];
  for (const item of response.output ?? []) {
    if (item.type === "function_call") content.push({ type: "tool_use", id: item.call_id, name: item.name,
      input: JSON.parse(item.arguments || "{}") });
    if (item.type === "message") for (const b of item.content ?? []) {
      if (b.type === "output_text") {
        const sources = [...new Set((b.annotations ?? []).filter((a: Obj) => a.type === "url_citation")
          .map((a: Obj) => a.url))];
        content.push({ type: "text", text: b.text + (sources.length ? "\n\nBronnen: " + sources.join(" · ") : ""), citations: null });
      } else if (b.type === "refusal") content.push({ type: "text", text: b.refusal, citations: null });
    }
  }
  const u = response.usage ?? {};
  return { id: response.id, type: "message", role: "assistant", model: requestedModel, content,
    stop_reason: content.some(b => b.type === "tool_use") ? "tool_use"
      : response.status === "incomplete" ? "max_tokens" : "end_turn", stop_sequence: null,
    usage: { input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0 } };
}

// Het bestaande Anthropic-clientprotocol blijft werken, ook voor hulpmiddelverzoeken.
export function berichtStroom(message: Obj) {
  const events: Obj[] = [{ type: "message_start", message: { ...message, content: [], stop_reason: null,
    usage: { input_tokens: message.usage.input_tokens, output_tokens: 0 } } }];
  for (const [index, block] of message.content.entries()) {
    const tool = block.type === "tool_use";
    events.push({ type: "content_block_start", index, content_block: tool ? { ...block, input: {} } : { ...block, text: "" } });
    events.push({ type: "content_block_delta", index, delta: tool
      ? { type: "input_json_delta", partial_json: JSON.stringify(block.input) }
      : { type: "text_delta", text: block.text } });
    events.push({ type: "content_block_stop", index });
  }
  events.push({ type: "message_delta", delta: { stop_reason: message.stop_reason, stop_sequence: null },
    usage: { output_tokens: message.usage.output_tokens } }, { type: "message_stop" });
  return events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

export type OpenAIProvider = { endpoint?: string; inputPerMillion?: number; outputPerMillion?: number; searchCost?: number };

export async function openaiAntwoord(body: Obj, key: string, model: string, tellen: (cost: number) => Promise<unknown>, provider: OpenAIProvider = {}) {
  let request;
  try { request = openaiVerzoek(body, model); }
  catch (e) { return Response.json({ type: "error", error: { type: "invalid_request_error", message: (e as Error).message } }, { status: 400 }); }
  const endpoint = provider.endpoint ?? "https://api.openai.com/v1/responses";
  const azure = Boolean(provider.endpoint);
  let r: Response;
  try {
    r = await fetch(endpoint, {
      method: "POST", headers: azure
        ? { "api-key": key, "Content-Type": "application/json" }
        : { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(request), signal: AbortSignal.timeout(110000),
    });
  } catch (error) {
    console.error(azure ? "azure_connection" : "openai_connection", error instanceof Error ? error.name : "unknown");
    return Response.json({ type: "error", error: { type: "api_error",
      message: azure ? "Azure AI is niet bereikbaar. Probeer het later opnieuw." : "ChatGPT is niet bereikbaar. Probeer het later opnieuw." } }, { status: 503 });
  }
  const raw = await r.text();
  let result: Obj;
  try { result = JSON.parse(raw); }
  catch {
    console.error(azure ? "azure_invalid_response" : "openai_invalid_response", r.status);
    return Response.json({ type: "error", error: { type: "api_error",
      message: "De AI-provider gaf een ongeldig antwoord. Probeer het later opnieuw." } }, { status: 502 });
  }
  if (!r.ok) {
    const code = result.error?.code ?? result.error?.type ?? "unknown";
    console.error(azure ? "azure" : "openai", r.status, code);
    const message = azure
      ? r.status === 401 || r.status === 403
        ? "Azure AI-autorisatie mislukt. Controleer de Azure API-sleutel."
        : r.status === 404 ? "Azure AI-deployment niet gevonden. Controleer de deploymentnaam."
        : r.status === 429 ? "Azure AI heeft tijdelijk de aanvraaglimiet bereikt."
        : "Azure AI is tijdelijk niet beschikbaar."
      : result.error?.type === "insufficient_quota" ||
        ["insufficient_quota", "credit_balance_exhausted"].includes(result.error?.code)
        ? "Het OpenAI API-tegoed is op of nog niet ingesteld. Vul het tegoed aan in OpenAI Platform."
        : "ChatGPT is nu niet beschikbaar. Probeer het later opnieuw.";
    return Response.json({ type: "error", error: { type: r.status === 429 ? "rate_limit_error" : "api_error", message } },
      { status: r.status >= 400 && r.status < 600 ? r.status : 502 });
  }
  if (result.status === "failed") throw new Error("OpenAI response failed");
  // De bestaande platformtarieven vormen de bovengrens voor het maandbudget; geen facturatie aan gebruikers.
  const usage = result.usage ?? {};
  const inputRate = provider.inputPerMillion ?? 4;
  const outputRate = provider.outputPerMillion ?? 20;
  const searchRate = provider.searchCost ?? 0.01;
  await tellen((usage.input_tokens ?? 0) * inputRate / 1e6 + (usage.output_tokens ?? 0) * outputRate / 1e6
    + (result.output ?? []).filter((i: Obj) => i.type === "web_search_call").length * searchRate);
  const message = openaiBericht(result, body.model);
  return body.stream ? new Response(berichtStroom(message), { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } })
    : Response.json(message);
}
