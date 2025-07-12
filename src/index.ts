import { ExtensionContext } from "vscode";
import { NpmAnalysis } from "./extension";

let extension: NpmAnalysis | undefined = new NpmAnalysis();

export function activate(context: ExtensionContext) {
     extension?.activate(context);
}

export function deactive() {
    extension?.deactive();
    extension = undefined;
}


