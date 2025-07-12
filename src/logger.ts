import { OutputChannel ,window} from "vscode";
import json from '../package.json';

export class Logger {
    private outputChannel: OutputChannel;

    constructor() {
        this.outputChannel = window.createOutputChannel(json.name);
    }

    info(message: string, ...args: any[]) {
        const timestamp = new Date().toISOString();
        const formattedMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
        this.outputChannel.appendLine(`[${timestamp}] INFO: ${formattedMessage}`);
    }

    warn(message: string, ...args: any[]) {
        const timestamp = new Date().toISOString();
        const formattedMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
        this.outputChannel.appendLine(`[${timestamp}] WARN: ${formattedMessage}`);
    }

    error(message: string, ...args: any[]) {
        const timestamp = new Date().toISOString();
        const formattedMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
        this.outputChannel.appendLine(`[${timestamp}] ERROR: ${formattedMessage}`);
    }

    show() {
        this.outputChannel.show();
    }

    dispose() {
        this.outputChannel.dispose();
    }
}
