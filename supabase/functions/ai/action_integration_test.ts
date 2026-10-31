import { verwerk } from "./index.ts";

Deno.test("AI proxy rejects unauthenticated action request", async () => {
  const response = await verwerk(new Request("https://example.com/ai/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-opus-5-5", assistant_action: { action: "mail.send" } }),
  }));
  if (response.status !== 401) throw Error("unauthenticated request was not rejected");
});
