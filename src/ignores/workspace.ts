import { Dependency, DependencyIgnoreHandler } from "../types";

export const ignoreWorkspace: DependencyIgnoreHandler = (dependency: Dependency): boolean => {
    return dependency.version.includes("workspace");
}