import { CancellationToken, CodeLens, CodeLensProvider, Event, EventEmitter, ProviderResult, TextDocument, Range } from 'vscode';
import { translate } from './i18n';

export class Provider implements CodeLensProvider {
    private _onDidChangeCodeLenses: EventEmitter<void> = new EventEmitter<void>();
    public readonly onDidChangeCodeLenses: Event<void> = this._onDidChangeCodeLenses.event;

    private dependencies: Map<string, any> = new Map();

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    updateDependencies(dependencies: Map<string, any>) {
        this.dependencies = dependencies;
        this.refresh();
    }

    provideCodeLenses(document: TextDocument, token: CancellationToken): ProviderResult<any[]> {
        if (token.isCancellationRequested) {
            return [];
        }

        const codeLenses: CodeLens[] = [];

        if (document.fileName.endsWith('package.json')) {
            return this.providePackageJsonCodeLenses(document);
        } else if (document.fileName.endsWith('pnpm-workspace.yaml')) {
            return this.providePnpmWorkspaceCodeLenses(document);
        }

        return codeLenses;
    }

    private providePackageJsonCodeLenses(document: TextDocument): CodeLens[] {
        const codeLenses: CodeLens[] = [];
        const content = document.getText();
        const lines = content.split('\n');

        let outdatedCount = 0;

        this.dependencies.forEach((dependency) => {
            // 只为当前文件且过期的依赖添加 CodeLens
            if (dependency.path === document.fileName && 
                dependency.latest && 
                this.isOutdated(dependency)) {
                const lineIndex = dependency.line - 1;
                const range = new Range(lineIndex, 0, lineIndex, lines[lineIndex]?.length || 0);
                const codeLens = new CodeLens(range, {
                    title: translate('upgradeTo', dependency.latest),
                    command: 'npm-analysis.upgradeSpecificDependency',
                    arguments: [dependency]
                });
                codeLenses.push(codeLens);
                outdatedCount++;
            }
        });

        if (outdatedCount > 0) {
            const range = new Range(0, 0, 0, 0);
            const upgradeAllCodeLens = new CodeLens(range, {
                title: `📦 ${translate('upgradeAllDependencies', outdatedCount.toString())}`,
                command: 'npm-analysis.upgradeDependency'
            });
            codeLenses.unshift(upgradeAllCodeLens);
        }

        return codeLenses;
    }

    private providePnpmWorkspaceCodeLenses(document: TextDocument): CodeLens[] {
        const codeLenses: CodeLens[] = [];
        const content = document.getText();
        const lines = content.split('\n');

        let outdatedCount = 0;

        this.dependencies.forEach((dependency) => {
            // 只为当前文件且过期的依赖添加 CodeLens
            if (dependency.path === document.fileName && 
                dependency.latest && 
                this.isOutdated(dependency)) {
                const lineIndex = dependency.line - 1;
                const range = new Range(lineIndex, 0, lineIndex, lines[lineIndex]?.length || 0);
                const codeLens = new CodeLens(range, {
                    title: translate('upgradeTo', dependency.latest),
                    command: 'npm-analysis.upgradeSpecificDependency',
                    arguments: [dependency]
                });
                codeLenses.push(codeLens);
                outdatedCount++;
            }
        });

        const totalDeps = Array.from(this.dependencies.values()) .filter(dep => dep.path === document.fileName).length;

        if (totalDeps > 0) {
            const range = new Range(0, 0, 0, 0);
            const statsCodeLens = new CodeLens(range, {
                title: `📊 ${translate('dependencyStats', totalDeps.toString(), outdatedCount.toString())}`,
                command: '' 
            });
            codeLenses.push(statsCodeLens);
            if (outdatedCount > 0) {
                const upgradeAllCodeLens = new CodeLens(new Range(1, 0, 1, 0), {
                    title: `📦 ${translate('upgradeAllOutdated', outdatedCount.toString())}`,
                    command: 'npm-analysis.upgradeDependency'
                });
                codeLenses.push(upgradeAllCodeLens);
            }
        }

        return codeLenses;
    }

    resolveCodeLens(codeLens: CodeLens, token: CancellationToken): ProviderResult<any> {
        return codeLens;
    }

    // 添加辅助方法来判断依赖是否过期
    private isOutdated(dependency: any): boolean {
        if (!dependency.latest || !dependency.version) return false;
        const cleanVersion = this.removeVersionPrefix(dependency.version);
        return cleanVersion !== dependency.latest;
    }

    private removeVersionPrefix(version: string): string {
        return version.replace(/^[\^~>=<v\s]+/, '');
    }
}