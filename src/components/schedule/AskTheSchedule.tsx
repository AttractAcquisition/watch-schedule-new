import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askTheSchedule, type AskTheScheduleMessage } from "@/lib/edge";
import { cn } from "@/lib/utils";

export function AskTheSchedule() {
  const [messages, setMessages] = useState<AskTheScheduleMessage[]>([
    {
      role: "assistant",
      content: "Ask about fairness debt, rotation stability, schedule health, or why a watch was assigned.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: AskTheScheduleMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const { reply } = await askTheSchedule(nextMessages);
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask the Schedule failed.");
      setMessages(nextMessages);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    sendMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  return (
    <section className="rounded border border-border bg-background/35 p-4">
      <h3 className="text-sm font-medium">Ask the Schedule</h3>

      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={cn(
              "rounded-md px-3 py-2 text-sm leading-relaxed",
              message.role === "user"
                ? "ml-6 bg-primary/15 text-foreground"
                : "mr-6 border border-border bg-surface text-muted-foreground",
            )}
          >
            {message.content}
          </div>
        ))}
        {loading && (
          <div className="mr-6 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask why a crew member has high debt…"
          rows={2}
          className="min-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
        />
        <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </section>
  );
}
