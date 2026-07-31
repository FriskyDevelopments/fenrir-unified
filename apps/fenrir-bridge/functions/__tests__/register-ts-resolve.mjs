/**
 * Installs the extensionless-import resolve hook for `node --test`.
 * See ts-resolve.mjs for why the functions/ tree needs one.
 */
import { registerHooks } from "node:module";

import { resolve } from "./ts-resolve.mjs";

registerHooks({ resolve });
