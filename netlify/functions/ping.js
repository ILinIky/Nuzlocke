// netlify/functions/ping.js
export default async () =>
    new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  