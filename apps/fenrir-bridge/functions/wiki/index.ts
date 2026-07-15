// Serves the MyFenrir Wiki at exactly /wiki.
import { wikiResponse } from '../_lib/wiki-html';

export const onRequestGet: PagesFunction = async () => wikiResponse();
export const onRequestHead: PagesFunction = async () =>
  new Response(null, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
