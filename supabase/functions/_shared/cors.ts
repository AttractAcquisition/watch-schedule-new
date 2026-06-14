export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function corsResponse(status = 204) {
  return new Response(null, { status, headers: CORS });
}

export function json<T>(data: T, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function err(message: string, status = 400) {
  return json({ error: message }, status);
}
