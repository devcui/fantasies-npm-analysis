import { Dependency } from "../types";
import { ignoreCatalog } from "./catalog";
import { ignoreLatest } from "./latest";
import { ignoreWorkspace } from "./workspace";

const handlers = [ignoreLatest, ignoreCatalog, ignoreWorkspace]

export function ignoreUpgrade(dependency: Dependency): boolean {
    return handlers.some(handler => handler(dependency));
}