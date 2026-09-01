import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runP180AuthorizationCli, verifyP180SiblingAuthorization } from "./verify-p180-t03-authorization.mjs";

export const verifyP180T04Authorization = (options = {}) => verifyP180SiblingAuthorization({ ...options, ticket: "T04" });

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) runP180AuthorizationCli("T04");
