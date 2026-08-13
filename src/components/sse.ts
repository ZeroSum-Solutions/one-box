/**
 * Minimal SSE frame reader for POST-based streaming responses (native
 * EventSource only supports GET, so /api/chat and /api/edit responses are
 * read by hand). Matches the wire format `ai`'s toUIMessageStreamResponse()
 * actually emits: `data: <json>\n\n` frames, trailing `data: [DONE]\n\n`.
 * Malformed frames are dropped rather than killing the stream.
 */
export async function readSSE(
  response: Response,
  onEvent: (data: unknown) => void
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        onEvent(JSON.parse(payload));
      } catch {
        // ignore malformed frame
      }
    }
  }
}
