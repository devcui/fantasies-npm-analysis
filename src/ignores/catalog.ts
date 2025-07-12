import { Dependency, DependencyIgnoreHandler } from "../types";

export const ignoreCatalog: DependencyIgnoreHandler = (dependency: Dependency): boolean => {
    return dependency.version.includes("catalog")
}