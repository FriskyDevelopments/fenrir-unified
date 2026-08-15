import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const communityId = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);

export type CommunityBotReadiness = {
  communityId: string;
  verified: boolean;
  botAdmin: boolean;
  mainGroupAdmin: boolean;
  waitingRoomAdmin: boolean;
};

export const getBotCommunitiesReadiness = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ communityIds: z.array(communityId).max(20) }).parse(data))
  .handler(async ({ data }) => {
    const ids = [...new Set(data.communityIds)];
    return Promise.all(
      ids.map(async (id): Promise<CommunityBotReadiness> => {
        try {
          const response = await fetch(
            `https://gate.myfenrir.com/api/readiness?community=${encodeURIComponent(id)}`,
            { headers: { accept: "application/json" } },
          );
          const payload = (await response.json()) as {
            ok?: boolean;
            bot?: { reachable?: boolean };
            communities?: {
              mainGroupAdmin?: boolean;
              waitingRoomAdmin?: boolean;
              waitingRoomMode?: "telegram_group" | "bot_dm";
            };
          };
          const mainGroupAdmin = payload.communities?.mainGroupAdmin === true;
          const virtualWaitingRoom = payload.communities?.waitingRoomMode === "bot_dm";
          const waitingRoomAdmin =
            virtualWaitingRoom || payload.communities?.waitingRoomAdmin === true;
          return {
            communityId: id,
            verified: response.ok && payload.ok === true,
            botAdmin: payload.bot?.reachable === true && mainGroupAdmin && waitingRoomAdmin,
            mainGroupAdmin,
            waitingRoomAdmin,
          };
        } catch {
          return {
            communityId: id,
            verified: false,
            botAdmin: false,
            mainGroupAdmin: false,
            waitingRoomAdmin: false,
          };
        }
      }),
    );
  });
