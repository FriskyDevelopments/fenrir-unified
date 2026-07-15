export async function onRequestGet(context: any) {
  return Response.redirect(new URL('/waitlist/index.html', context.request.url).toString(), 302);
}
