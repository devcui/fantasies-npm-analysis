import { Dependency, DependencyIgnoreHandler } from "../types";

export const ignoreLatest: DependencyIgnoreHandler = (dependency: Dependency): boolean => {
    return dependency.version.includes("latest")
}