import { corsResponse, err, json } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `You are a maritime crew list parser. Given an image of a superyacht crew list, extract all crew members.
For each crew member return a JSON array of objects with:
- full_name: string (required)
- position: string or null (e.g. "2nd Officer", "Bosun", "Stewardess")
- rank: string or null (e.g. "OOW", "Able Seaman")
- department: one of "command", "deck", "interior", "engineering", "unassigned"

Respond ONLY with a valid JSON array. No markdown, no explanation.`;

interface ExtractedCrew {
  full_name: string;
  position: string | null;
  rank: string | null;
  department: "command" | "deck" | "interior" | "engineering" | "unassigned";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { image_base64, media_type } = await req.json();
    if (!image_base64) return err("image_base64 is required.");

    // Anthropic max image size is ~5 MB of raw bytes (roughly 6.7 MB base64)
    if (image_base64.length > 7_000_000) {
      return err("Image is too large. Please use a photo under 5 MB.");
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return err("ANTHROPIC_API_KEY not configured.", 500);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: media_type ?? "image/jpeg",
                  data: image_base64,
                },
              },
              { type: "text", text: "Extract all crew members from this image." },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return err(`Anthropic API error: ${body}`, 500);
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text ?? "[]";

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let crew: ExtractedCrew[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      crew = Array.isArray(parsed) ? parsed : [];
    } catch {
      return err("Could not extract crew data from image. Please try a clearer photo.");
    }

    const valid = crew
      .filter((m) => typeof m.full_name === "string" && m.full_name.trim())
      .map((m) => ({
        full_name: m.full_name.trim(),
        position: m.position ?? null,
        rank: m.rank ?? null,
        department: (
          ["command", "deck", "interior", "engineering", "unassigned"].includes(m.department)
            ? m.department
            : "unassigned"
        ) as ExtractedCrew["department"],
      }));

    return json({ crew: valid });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Internal error", 500);
  }
});
