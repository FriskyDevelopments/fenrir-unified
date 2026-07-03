import { renderActivation } from "../../_lib/activation-page";
// Branded MyFenrir activation for CyberPUP Security (replaces the dead Cloud Run proxy).
export const onRequest: PagesFunction = (context) =>
  renderActivation(context.request, context.env as any, "security");
