import * as vscode from "vscode";
import { I18nMessages } from "./types"

const languages: { [key: string]: I18nMessages } = {
    zh: {
        'upgradeTo': '升级到 {0}',
        'upgradeAllDependencies': '升级所有依赖 ({0} 个过期)',
        'dependencyStats': '依赖统计: 共 {0} 个，{1} 个过期',
        'upgradeAllOutdated': '升级所有过期依赖 ({0} 个)',
        'latestVersion': '最新版本: {0}',
        'currentVersion': '当前版本: {0}'
    },
    en: {
        'upgradeTo': 'Upgrade to {0}',
        'upgradeAllDependencies': 'Upgrade all dependencies ({0} outdated)',
        'dependencyStats': 'Dependency stats: {0} total, {1} outdated',
        'upgradeAllOutdated': 'Upgrade all outdated dependencies ({0})',
        'latestVersion': 'Latest version: {0}',
        'currentVersion': 'Current version: {0}'
    }
}

export function isZh(): boolean {
    return vscode.env.language === 'zh' || vscode.env.language.startsWith('zh-');
}

export const translate = (key: string, ...args: string[]): string => {
    let message = languages.en[key] || key;
    if (isZh()) {
        message = languages.zh[key] || message;
    }
    args.forEach((arg, index) => {
        message = message.replace(new RegExp(`\\{${index}\\}`, 'g'), arg);
    });
    return message;
}