import { commands, ExtensionContext, languages, RelativePattern, workspace } from "vscode";
import { Dependency } from "./types";
import { EventEmitter } from "vscode";
import { Logger } from './logger'
import { readFile, writeFile } from "fs";
import { ignoreUpgrade } from "./ignores";
import { load } from 'js-yaml'
import { Provider } from "./provider";

export class NpmAnalysis {
    cache: Map<string, Dependency> = new Map();
    context: ExtensionContext | undefined;
    file$: EventEmitter<{ path: string; type: string }>;
    dependency$: EventEmitter<{ type: string; payload: Dependency }>;
    logger: Logger;
    codeLensProvider: Provider | undefined;

    constructor() {
        this.logger = new Logger();
        // this.logger.show();
        this.file$ = new EventEmitter<{ path: string; type: string }>();
        this.dependency$ = new EventEmitter<{ type: string; payload: Dependency }>();
    }

    activate(context: ExtensionContext) {
        this.logger.info("Activating NpmAnalysis extension...");
        this.context = context;
        this.codeLensProvider = new Provider();
        this.registerCodeLens();
        this.registerCommands();

        this.file$.event(data => {
            if (data.type === 'json') {
                this.loadJsonDependency(data.path);
            } else if (data.type === 'yaml') {
                this.loadYamlDependency(data.path);
            } else {
                this.logger.error(`Unsupported file type: ${data.type} for file: ${data.path}`);
            }
        });

        this.dependency$.event((data: { type: string; payload: Dependency }) => {
            switch (data.type) {
                case 'add':
                    if (!ignoreUpgrade(data.payload)) this.fetchDependency(data.payload);
                    break;
                case 'fetched':
                    if (!ignoreUpgrade(data.payload)) this.nextVersionValidate(data.payload);
                    break;
                case 'next':
                    this.codeLensProvider?.updateDependencies(this.cache);
                    break;
                default:
                    this.logger.error(`Unknown event type: ${data.type}`);
            }
        });

        this.loadFiles();
    }

    loadFiles() {
        this.logger.info("Loading files from workspace...");
        const workspaceFolders = workspace.workspaceFolders;
        if (!workspaceFolders) {
            this.logger.error("No workspace folders found.");
            return;
        }
        for (const folder of workspaceFolders) {
            this.logger.info(`Workspace folder: ${folder.uri.fsPath}`);
            workspace.findFiles(new RelativePattern(folder, "**/package.json"), '**/node_modules/**').then(files => {
                files.forEach(file => {
                    this.file$.fire({ path: file.fsPath, type: 'json' });
                });
            })
            workspace.findFiles(new RelativePattern(folder, "**/pnpm-workspace.yaml"), '**/node_modules/**').then(files => {
                files.forEach(file => {
                    this.file$.fire({ path: file.fsPath, type: 'yaml' });
                });
            })
        }
    }

    loadJsonDependency(file: string) {
        this.logger.info(`Loading JSON dependencies from: ${file}`);
        readFile(file, 'utf8', (err, data) => {
            if (err) {
                this.logger.error(`Error reading file ${file}: ${err.message}`);
                return;
            }
            const packageJSON = JSON.parse(data)
            const dependencyTypes: Array<keyof typeof packageJSON> = [
                'dependencies',
                'devDependencies',
                'peerDependencies',
                'optionalDependencies'
            ];
            const lines = data.split('\n');
            for (const type of dependencyTypes) {
                const deps = packageJSON[type];
                if (!deps) continue;
                for (const [name, version] of Object.entries(deps)) {
                    const lineNumber = this.findDependencyLine(lines, name, String(version));
                    this.dependency$.fire({
                        type: 'add',
                        payload: {
                            name,
                            version: String(version),
                            latest: null,
                            line: lineNumber,
                            path: file,
                            fetched: false
                        }
                    })
                }
            }
        })
    }

    findDependencyLine(lines: string[], name: string, version: string): number | null {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes(name) && line.includes(version)) {
                return i + 1;
            }
        }
        return null;
    }

    removeVersionPrefix(version: string): string {
        return version.replace(/^[\^~>=<v\s]+/, '');
    }

    loadYamlDependency(file: string) {
        this.logger.info(`Loading YAML dependencies from: ${file}`);
        readFile(file, "utf-8", (err, data) => {
            if (err) {
                return;
            }
            const config = load(data) as { catalogs: { [key: string]: Record<string, string> } };
            if (config && typeof config === 'object' && config.catalogs && typeof config.catalogs === 'object') {
                const lines = data.split('\n');
                Object.keys(config.catalogs).forEach(mode => {
                    const deps = config.catalogs[mode];
                    if (deps && typeof deps === 'object') {
                        Object.entries(deps).forEach(([name, version]) => {
                            this.dependency$.fire({
                                type: 'add',
                                payload: {
                                    name,
                                    version: String(version),
                                    latest: null,
                                    line: this.findDependencyLine(lines, name, String(version)),
                                    fetched: false,
                                    path: file
                                }
                            })
                        });
                    }
                });
            } else {
                this.logger.error(`YAML catalogs structure is invalid in file ${file}`);
            }
        });
    }

    fetchDependency(dependency: Dependency) {
        this.logger.info(`${dependency.path}:${dependency.line}:${dependency.name}:${dependency.version} awaiting for fetch...`);
        
        // 只使用唯一键（包含路径和行号）
        const uniqueKey = `${dependency.name}:${dependency.path}:${dependency.line}`;
        const cached = this.cache.get(uniqueKey);
        
        if (cached && cached.fetched && cached.latest) {
            this.dependency$.fire({
                type: 'fetched',
                payload: cached
            });
            return;
        }
        
        // 检查是否已经为其他位置的同名包获取过版本信息
        const existingEntry = Array.from(this.cache.values()).find(dep => 
            dep.name === dependency.name && dep.fetched && dep.latest
        );
        
        if (existingEntry) {
            dependency.fetched = true;
            dependency.latest = existingEntry.latest;
            this.cache.set(uniqueKey, dependency);
            this.dependency$.fire({
                type: 'fetched',
                payload: dependency
            });
            return;
        }
        
        fetch(`https://registry.npmjs.org/${dependency.name}/latest`).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            response.json().then(data => {
                dependency.fetched = true;
                dependency.latest = data.version;
                
                // 只保存唯一键的依赖信息
                this.cache.set(uniqueKey, dependency);
                
                this.dependency$.fire({ type: 'fetched', payload: dependency });
            });
        }).catch(error => {
            this.logger.error(`Failed to fetch ${dependency.name}: ${error.message}`);
        });
    }

    nextVersionValidate(dependency: Dependency) {
        this.logger.info(`${dependency.path}:${dependency.line}:${dependency.name}:${dependency.version} validating...`);
        if (this.removeVersionPrefix(dependency.version) !== dependency.latest) {
            this.dependency$.fire({ type: 'next', payload: dependency });
        } else {
            this.logger.info(`${dependency.path}:${dependency.line}:${dependency.name}:${dependency.version} is the latest version.`);
        }
    }

    registerCodeLens() {
        if (this.context && this.codeLensProvider) {
            this.context.subscriptions.push(
                languages.registerCodeLensProvider(
                    [
                        { language: 'json', pattern: '**/package.json' },
                        { language: 'yaml', pattern: '**/pnpm-workspace.yaml' }
                    ],
                    this.codeLensProvider
                ),
            );
        }
    }

    registerCommands() {
        commands.registerCommand('npm-analysis.upgradeDependency', () => {
            this.logger.info(`cache size: ${this.cache.size}`);
            
            // 获取所有需要升级的依赖项
            const dependenciesToUpgrade = Array.from(this.cache.values())
                .filter(dep => 
                    dep.fetched && 
                    dep.latest && 
                    dep.line !== null &&
                    this.removeVersionPrefix(dep.version) !== dep.latest
                );
            
            this.logger.info(`Found ${dependenciesToUpgrade.length} dependencies to upgrade`);
            dependenciesToUpgrade.forEach((dependency) => {
                this.logger.info(`Upgrading dependency: ${dependency.name} from ${dependency.version} to ${dependency.latest}`);
                this.upgradeDependency(dependency);
            });
        })
        commands.registerCommand('npm-analysis.upgradeSpecificDependency', (dependency: Dependency) => {
            this.logger.info(`Upgrading dependency: ${dependency.name} to version ${dependency.latest}`);
            this.upgradeDependency(dependency);
        })
    }

    upgradeDependency(dependency: Dependency) {
        if (dependency.line !== null && dependency.path && dependency.fetched && dependency.version !== dependency.latest) {
            readFile(dependency.path, 'utf8', (err, data) => {
                if (err) {
                    this.logger.error(`Error reading file ${dependency.path}: ${err.message}`);
                    return;
                }
                const lines = data.split('\n');
                if (!dependency.line) return
                const lineIndex = dependency.line - 1;
                const targetLine = lines[lineIndex];

                if (targetLine.includes(dependency.name) && targetLine.includes(dependency.version)) {
                    const cleanNewVersion = dependency.latest;
                    if (!cleanNewVersion) return;
                    
                    // 保留原版本的前缀（^, ~, >= 等）
                    const versionPrefix = dependency.version.match(/^[\^~>=<v\s]+/)?.[0] || '';
                    const newVersionWithPrefix = versionPrefix + cleanNewVersion;
                    
                    // 对于YAML文件，需要特殊处理以保持格式
                    let updatedLine;
                    if (dependency.path.endsWith('.yaml') || dependency.path.endsWith('.yml')) {
                        // 保持原有的缩进和格式，只替换版本号部分
                        const leadingWhitespace = targetLine.match(/^[\s]*/)?.[0] || '';
                        const restOfLine = targetLine.substring(leadingWhitespace.length);
                        const updatedRestOfLine = restOfLine.replace(dependency.version, newVersionWithPrefix);
                        updatedLine = leadingWhitespace + updatedRestOfLine;
                    } else {
                        // JSON文件直接替换
                        updatedLine = targetLine.replace(dependency.version, newVersionWithPrefix);
                    }

                    lines[lineIndex] = updatedLine;

                    // 使用原始数据的换行符风格
                    const newlineStyle = data.includes('\r\n') ? '\r\n' : '\n';
                    const updatedContent = lines.join(newlineStyle);

                    writeFile(dependency.path, updatedContent, 'utf8', (writeErr) => {
                        if (writeErr) {
                            this.logger.error(`Error writing file ${dependency.path}: ${writeErr.message}`);
                        } else {
                            this.logger.info(`Dependency ${dependency.name} upgraded from ${dependency.version} to ${newVersionWithPrefix} in ${dependency.path}`);
                            // 更新缓存中的版本信息，避免重复升级
                            dependency.version = newVersionWithPrefix;
                            
                            // 只更新唯一键缓存
                            const uniqueKey = `${dependency.name}:${dependency.path}:${dependency.line}`;
                            this.cache.set(uniqueKey, dependency);
                        }
                    });
                } else {
                    this.logger.error(`Dependency ${dependency.name} not found on line ${dependency.line} in ${dependency.path}`);
                }
            });
        }
    }

    deactive() {
        this.file$.dispose()
        this.dependency$.dispose()
        this.logger.dispose();
    }
}