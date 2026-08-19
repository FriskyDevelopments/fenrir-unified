export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/send") {
      return new Response("Not found", { status: 404 });
    }
    const message = await request.json();
    if (!message?.to || !message?.subject || message?.from?.email !== "noreply@mail.myfenrir.com") {
      return Response.json({ ok: false, error: "invalid_message" }, { status: 400 });
    }
    await env.EMAIL.send(message);
    return Response.json({ ok: true });
  },
};
