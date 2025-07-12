export interface Dependency {
  name: string
  version: string
  latest: string | null
  path: string
  line: number | null
  fetched: boolean
}


export type DependencyIgnoreHandler = (dependency: Dependency) => boolean;


export interface I18nMessages {
  [key: string]: string;
}