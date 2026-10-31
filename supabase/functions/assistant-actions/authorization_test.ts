import { handleAssistantAction } from "./index.ts";

Deno.test("reject unauthenticated requests", async () => {
  const request = new Request("https://example.test/assistant-actions", {
    method: "POST",
    body: JSON.stringify({ action: "tasks.read" }),
  });
  const result = await handleAssistantAction(request);
  if (result.status !== 401) throw new Error("expected 401");
});

Deno.test("reject non POST requests", async () => {
  const result = await handleAssistantAction(new Request("https://example.test/assistant-actions"));
  if (result.status !== 405) throw new Error("expected 405");
});
