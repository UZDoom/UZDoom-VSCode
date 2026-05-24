/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/no-explicit-any */
process.env.FORCE_COLOR = '2';

import { DebugProtocol as DAP } from '@vscode/debugprotocol';
import * as net from 'net';
import * as stream from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { pino } from 'pino';
import * as pino_pretty from 'pino-pretty';
import * as chalk_d from 'chalk';
import { Event as DAPEvent, Response } from '@vscode/debugadapter/lib/messages'; // avoid pulling in the whole debugadapter
import * as url from 'url';
import { default as colorizer } from '../colorizer';
import { ChildProcess } from 'child_process';
import { DestinationStream, BaseLogger } from 'pino';
import { Disposable, Emitter, Event } from './IDEInterface';
// import { DebugConfiguration } from 'vscode';
export interface DebugConfiguration {
    /**
     * The type of the debug session.
     */
    type: string;

    /**
     * The name of the debug session.
     */
    name: string;

    /**
     * The request type of the debug session.
     */
    request: string;

    /**
     * Additional debug type specific properties.
     */
    [key: string]: any;
}

const chalk: chalk_d.ChalkInstance = chalk_d.default.constructor({ enabled: true, level: 2 });

export interface DebugProtocolMessage { }
/**
 * A structurally equivalent copy of vscode.DebugAdapter
 */
export interface VSCodeDebugAdapter extends Disposable {
    readonly onDidSendMessage: Event<DebugProtocolMessage>;

    handleMessage(message: DAP.ProtocolMessage): void;
}

const isProduction = false;

const TWO_CRLF = '\r\n\r\n';
const HEADER_LINESEPARATOR = /\r?\n/; // allow for non-RFC 2822 conforming line separators
const HEADER_FIELDSEPARATOR = /: */;

const custom_colors = {
    STRING_KEY: '#9cdcfe',
    STRING_LITERAL: '#CE9178',
    COLON: 'gray',
};

export function colorize_message(value: any) {
    let colorized = colorizer(value, { colors: custom_colors, pretty: true, forceColor: true });
    // Make the "success" and "message" fields red if they are present and "success" is false
    if (typeof value === 'object' && value !== null && value.hasOwnProperty('success') && !value.success) {
        const lines = colorized.split('\n');
        for (const idx in lines) {
            const line = lines[idx];
            if (line.includes('"success"') || line.includes('"message"')) {
                // eslint-disable-next-line no-control-regex
                const line_split = line.replace(/\x1b\[[0-9;]*m/g, '').split(':');
                const key = line_split[0];
                const value = line_split[1];
                const colorized_value = chalk.hex('#FF0000')(value);
                const colorized_key = chalk.hex('#9cdcfe')(key);
                const colorized_colon = chalk.hex('#D4D4D4')(':');
                const result = `${colorized_key}${colorized_colon}${colorized_value}`;
                lines[idx] = result;
            }
        }
        colorized = lines.join('\n');
    }

    return colorized;
}
export type DAPLogLevel = pino.LevelWithSilent;

export interface DebugAdapterProxyOptions extends DebugConfiguration {
    port: number;
    host?: string;
    /**
     * If true, start the proxy immediately (default: true)
     */
    startNow?: boolean;
    /**
     *  Log level for messages output to the console (default: "info")
     */
    consoleLogLevel?: DAPLogLevel;
    /**
     * Log level for messages output to the log file (default: "trace")
     * `silent` turns off file logging
     */
    fileLogLevel?: DAPLogLevel;
    /**
     * Directory to write logs to (default: ~/.DAPProxy)
     */
    logdir?: string;
    /**
     * Log level for messages from the client to the proxy (default: "debug")
     */
    logClientToProxy?: DAPLogLevel;
    /**
     * Log level for messages from the proxy to the client (default: "trace")
     */
    logProxyToClient?: DAPLogLevel;
    /**
     * Log level for messages from the server to the proxy (default: "debug")
     */
    logServerToProxy?: DAPLogLevel;
    /**
     * Log level for messages from the proxy to the server (default: "trace")
     */
    logProxyToServer?: DAPLogLevel;

    /**
     * If true, prints the request that an error response is associated with (default: true)
     */
    logRequestOnErrorResponse?: boolean;

    /**
     * The client capabilities
     * default:
     * {
     *   adapterID: '',
     *   linesStartAt1: true,
     *   columnsStartAt1: true,
     *   pathFormat: 'path',
     *   supportsVariableType: true
     *   pathsAreURIs: false
     * }
     *
     */
    clientCapabilities?: ClientCapabilities;

    /**
     * The debugger locale
     *
     * default:
     * {
     *  linesStartAt1: true,
     *  columnsStartAt1: true,
     *  pathsAreURIs: false
     * }
     */
    debuggerLocale?: DebuggerLocale;

    /**
     * launcherProcess
     * The executable that was launched, if this was a 'launch' request
     */
    launcherProcess?: ChildProcess

    /**
     * The pid of the launched process
     */
    pid?: number
}

// these are the ones we care about, so we make them mandatory
export interface ClientCapabilities extends DAP.InitializeRequestArguments {
    linesStartAt1: boolean;
    columnsStartAt1: boolean;
    pathFormat: 'path' | 'uri' | string;
    supportsVariableType: boolean;
    pathsAreURIs: boolean;
}

export interface DebuggerLocale {
    linesStartAt1: boolean;
    columnsStartAt1: boolean;
    pathsAreURIs: boolean;
}

const DEFAULT_CLIENT_CAPABILITIES: ClientCapabilities = {
    adapterID: 'DebugAdapterProxy',
    linesStartAt1: true,
    columnsStartAt1: true,
    pathFormat: 'path',
    supportsVariableType: true,
    pathsAreURIs: false,
};

const DEFAULT_DEBUGGER_LOCALE: DebuggerLocale = {
    linesStartAt1: true,
    columnsStartAt1: true,
    pathsAreURIs: false,
};

// interface LogFn {
//     // TODO: why is this different from `obj: object` or `obj: any`?
//     /* tslint:disable:no-unnecessary-generics */
//     <T extends object>(obj: T, msg?: string, ...args: any[]): void;
//     (obj: unknown, msg?: string, ...args: any[]): void;
//     (msg: string, ...args: any[]): void;
// }

class ConsoleStream implements DestinationStream {
    public write(msg: string) {
        console.log(msg);
    }
    public log(level: string, obj: any, msg?: string, ...args: any[]) {
        if (typeof obj === 'string') {
            if (msg !== undefined) {
                args.unshift(msg);
            }
            msg = obj;
            obj = undefined;
        }
        if (level === 'fatal' || level === 'error' || level === 'warn') {
            console.error(colorizeMessage(true, msg), ...args);
            if (obj) {
                console.error(obj);
            }
            return;
        }
        console.log(colorizeMessage(false, msg), ...args);
        if (obj) {
            console.log(obj);
        }
    }
}

function colorizeMessage(is_error: boolean, message?: string) {
    if (is_error) {
        return chalk.hex('#FF0000')(message);
    }
    return chalk.hex('#CE9178')(message);
}

class ConsoleLogger implements BaseLogger {
    private cstream: ConsoleStream = new ConsoleStream();

    private _log(level: string, obj: any, msg?: string, ...args: any[]): void {
        this.cstream.log(level, obj, msg, ...args);
    }
    constructor() {
    }
    public level = 'silent';

    // levels go like this: silent, trace, debug, info, warn, error, fatal
    levelToInt(level: string) {
        switch (level) {
            case 'fatal':
                return 60;
            case 'error':
                return 50;
            case 'warn':
                return 40;
            case 'info':
                return 30;
            case 'debug':
                return 20;
            case 'trace':
                return 10;
            case 'silent':
                return 1000;
            default:
                return 1000;
        }
    }
    public shouldLog(level: string) {
        if (this.level === 'silent') {
            return false;
        }
        // levels go like this: silent, trace, debug, info, warn, error, fatal
        return this.levelToInt(level) >= this.levelToInt(this.level);
    }
    public fatal(obj: any, msg?: string, ...args: any[]): void {
        if (this.shouldLog('fatal')) this._log('fatal', obj, msg, ...args);

    }
    public error(obj: any, msg?: string, ...args: any[]): void {
        if (this.shouldLog('error')) this._log('error', obj, msg, ...args);
    }
    public warn(obj: any, msg?: string, ...args: any[]): void {
        if (this.shouldLog('warn')) this._log('warn', obj, msg, ...args);
    }
    public info(obj: any, msg?: string, ...args: any[]): void {
        if (this.shouldLog('info')) this._log('info', obj, msg, ...args);
    }
    public debug(obj: any, msg?: string, ...args: any[]): void {
        if (this.shouldLog('debug')) this._log('debug', obj, msg, ...args);
    }
    public trace(obj: any, msg?: string, ...args: any[]): void {
        if (this.shouldLog('trace')) this._log('trace', obj, msg, ...args);
    }
    public silent(obj: any, msg?: string, ...args: any[]): void {
    }
}

enum DebugAdapterProxyState {
    Disconnected,
    Connecting,
    Connected,
    Stopping
}
export abstract class DebugAdapterProxy implements VSCodeDebugAdapter {
    protected currentState = DebugAdapterProxyState.Disconnected;
    protected outputStream!: stream.Writable;
    protected inputStream!: stream.Readable;
    protected rawData = Buffer.allocUnsafe(0);
    protected contentLength = -1;
    protected _socket?: net.Socket;
    protected port: number;
    protected host: string;
    protected readonly _onError = new Emitter<Error>();
    protected readonly _onExit = new Emitter<number | null>();
    protected _sendMessage = new Emitter<DebugProtocolMessage>();
    protected logClientToProxy: DAPLogLevel = 'debug';
    protected logProxyToClient: DAPLogLevel = 'trace';
    protected logServerToProxy: DAPLogLevel = 'debug';
    protected logProxyToServer: DAPLogLevel = 'trace';
    protected logRequestOnErrorResponse: boolean = true;
    protected consoleLogLevel: DAPLogLevel = isProduction ? 'warn' : 'debug';
    protected fileLogLevel: DAPLogLevel = 'silent';
    protected readonly connectionTimeoutLimit = 12000; // the debugger will disconnect after about 20 seconds, so we need to be faster than that
    protected connectionTimeout: NodeJS.Timeout | undefined;
    protected logDirectory: string;
    protected logFilePath: string;
    protected serverMsgQueue: DAP.ProtocolMessage[] = [];
    protected loggerFile: pino.Logger;
    protected loggerConsole: pino.BaseLogger;
    protected logFile: stream.Writable;
    protected clientCaps: ClientCapabilities;
    protected debuggerLocale: DebuggerLocale;
    protected launcherProcess?: ChildProcess
    protected _onConnected: Emitter<void> = new Emitter<void>();
    protected pid?: number;
    constructor(options: DebugAdapterProxyOptions) {
        this.launcherProcess = options.launcherProcess;
        // this.launcherProcess?.stderr?.on('data', (data) => {
        //     this.logerror(data.toString());
        // });
        // this.launcherProcess?.stdout?.on('data', (data) => {
        //     this.loginfo(data.toString());
        // });
        // this.launcherProcess?.addListener('exit', (code) => {
        //     this.loginfo(`Launcher process exited with code ${code}`);
        //     this.emitExit(code);
        //     this.stop();
        // });
        this.port = options.port;
        this.host = options.host || 'localhost';
        this.consoleLogLevel = options.consoleLogLevel || this.consoleLogLevel;
        this.fileLogLevel = options.fileLogLevel || this.fileLogLevel;
        this.logClientToProxy = options.logClientToProxy || this.logClientToProxy;
        this.logProxyToClient = options.logProxyToClient || this.logProxyToClient;
        this.logServerToProxy = options.logServerToProxy || this.logServerToProxy;
        this.logProxyToServer = options.logProxyToServer || this.logProxyToServer;
        this.clientCaps = options.clientCapabilities || DEFAULT_CLIENT_CAPABILITIES;
        this.debuggerLocale = options.debuggerLocale || DEFAULT_DEBUGGER_LOCALE;
        this.pid = options.pid;
        const homepath = process.env.HOME;
        this.logDirectory = options.logdir || path.join(homepath!, '.DAPProxy');
        this.logFilePath = this.getLogFilePath(this.logDirectory);
        // mkdirp this.logDirectory
        if (!fs.existsSync(this.logDirectory)) {
            fs.mkdirSync(this.logDirectory, { recursive: true });
        }
        this.logFile = fs.createWriteStream(this.logFilePath, { flags: 'w' });
        const pprinterFile = pino_pretty.default({
            colorize: false,
            ignore: 'pid,hostname',
            destination: this.logFilePath,
        });
        this.loggerFile = pino({ level: this.fileLogLevel }, pprinterFile);
        // instance of ConsoleLogger
        this.loggerConsole = new ConsoleLogger();
        this.loggerConsole.level = this.consoleLogLevel;
        if (options.startNow) this.start();
    }

    protected getLogFilePath(logDir: string) {
        const date = new Date();
        return path.join(
            logDir,
            `debugadapter-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}__${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}.log`
        );
    }
    public logfatal(message: any, ...args: any[]) {
        this.log('fatal', message, ...args);
    }
    public logwarn(message: any, ...args: any[]) {
        this.log('warn', message, ...args);
    }
    public logerror(message: any, ...args: any[]) {
        this.log('error', message, ...args);
    }
    public loginfo(message: any, ...args: any[]) {
        this.log('info', message, ...args);
    }
    public logtrace(message: any, ...args: any[]) {
        this.log('trace', message, ...args);
    }
    public logdebug(message: any, ...args: any[]) {
        this.log('debug', message, ...args);
    }
    public log(level: DAPLogLevel, message: any, ...args: any[]) {
        switch (level) {
            case 'silent':
                break;
            case 'fatal':
                this.loggerFile.fatal(message, ...args);
                this.loggerConsole.fatal(message, ...args);
                break;
            case 'error':
                this.loggerFile.error(message, ...args);
                this.loggerConsole.error(message, ...args);
                break;
            case 'warn':
                this.loggerFile.warn(message, ...args);
                this.loggerConsole.warn(message, ...args);
                break;
            case 'info':
                this.loggerFile.info(message, ...args);
                this.loggerConsole.info(message, ...args);
                break;
            case 'debug':
                this.loggerFile.debug(message, ...args);
                this.loggerConsole.debug(message, ...args);
                break;
            case 'trace':
                this.loggerFile.trace(message, ...args);
                this.loggerConsole.trace(message, ...args);
                break;
            default:
                break;
        }
    }

    // These aren't listened to when we're running inline
    get onError(): Event<Error> {
        return this._onError.event;
    }

    get onExit(): Event<number | null> {
        return this._onExit.event;
    }

    protected emitError(error: Error) {
        this._onError.fire(error);
    }

    protected emitExit(code: number | null) {
        this._onExit.fire(code);
    }

    public start() {
        this.loginfo('Started Debug Adapter Proxy.');
        this.currentState = DebugAdapterProxyState.Connecting;
        // set a timeout that kills the server if no connection is established within 12 seconds
        this.connectionTimeout = setTimeout(() => {
            this.logerror('Cannot connect to DAP server!');
            this.emitOutputEvent('Cannot connect to DAP server!', 'important');
            this.stop();
        }, this.connectionTimeoutLimit);
        this._socket = net.createConnection(this.port, this.host, () => {
            this.connect(this._socket!, this._socket!);
            this.loginfo('Connected to DAP server!');
            clearTimeout(this.connectionTimeout);
            // create a new timer that fires the onConnected event after 100ms
            setTimeout(() => {
                this.currentState = DebugAdapterProxyState.Connected;
                this._onConnected.fire();
            }, 100);
        });
        this._socket.on('close', () => {
            if (this.currentState === DebugAdapterProxyState.Connected) {
                this.loginfo('Connection closed.');
                this.emitOutputEvent('Connection closed.', 'console');
                this.emitExit(0);
            } else if (this.currentState === DebugAdapterProxyState.Connecting) {
                this.logerror('Connection closed without connecting!');
                this.emitOutputEvent(`Connection closed without connecting!`, 'console');
                this.emitError(Error('Connection closed without connecting!'));
                this.emitExit(-1);
            }
            this.stop();
        });

        this._socket.on('error', (error: NodeJS.ErrnoException) => {
            if (this.currentState === DebugAdapterProxyState.Connected && error.code && error.code === 'ECONNRESET') {
                this.emitOutputEvent('Connection reset.', 'console');
                this.emitExit(0);
            } else {
                this.emitOutputEvent(`Connection error: ${error.message}`, 'important');
                this.emitError(error);
                this.emitExit(error.errno !== undefined ? error.errno : 1);
            }
            this.stop();
        });
    }

    public stop() {
        if (!this) {
            return;
        }
        if (this.currentState === DebugAdapterProxyState.Connected) {
            this.loginfo('Stopping...');
        } else if (this.currentState === DebugAdapterProxyState.Stopping || this.currentState === DebugAdapterProxyState.Disconnected) {
            return;
        }
        this.currentState = DebugAdapterProxyState.Stopping;
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
        }

        this.sendMessageToClient(new DAPEvent('terminated'));
        // remove the listener from the socket
        this._socket?.removeAllListeners();
        this._socket?.destroy();
        this.currentState = DebugAdapterProxyState.Disconnected;
    }

    protected emitOutputEvent(message: string, category: string = 'console') {
        const event = <DAP.OutputEvent>new DAPEvent('output');
        event.body = {
            category: category,
            output: message,
        };
        this.sendMessageToClient(event);
    }

    //override this
    protected handleMessageFromServer?(message: DAP.ProtocolMessage): void;

    //override this
    protected handleMessageFromClient?(message: DAP.ProtocolMessage): void;

    protected getLogObj(message: DAP.ProtocolMessage): any {
        let type = message.type;
        let obj: any = { type, message };
        if (message.type === 'response') {
            let response: string = (message as DAP.Response).command;
            obj = { response, message };
        } else if (message.type === 'event') {
            let event: string = (message as DAP.Event).event;
            obj = { event, message };
        } else if (message.type === 'request') {
            let request: string = (message as DAP.Request).command;
            obj = { request, message };
        }
        return obj;
    }

    protected sendMessageToClient(message: DAP.ProtocolMessage, noLog: boolean = false): void {

        if (!noLog) {
            let obj: any = this.getLogObj(message);

            if (message.type === 'response' && !(message as DAP.Response).success) {
                this.log('warn', obj, '***PROXY->CLIENT FAILED RESPONSE:');
            } else {
                this.log(this.logProxyToClient, obj, '***PROXY->CLIENT:');
            }
        }
        this._sendMessage.fire(message as DebugProtocolMessage);
    }

    protected processServerMsgQueue() {
        while (this.serverMsgQueue.length > 0) {
            const msg = this.serverMsgQueue.shift();
            if (msg) {
                this.sendMessageToServer(msg);
            }
        }
    }

    // Send message to server
    protected sendMessageToServer(message: DAP.ProtocolMessage, nolog: boolean = false): void {
        if (!nolog) {
            this.log(this.logProxyToServer, this.getLogObj(message), '***PROXY->SERVER:');
        }
        if (!this.outputStream) {
            this.serverMsgQueue.push(message);
            // On first message, bind a one time listener to the socket to process the queue
            if (this.serverMsgQueue.length == 1) {
                this._socket?.once('connect', () => {
                    this.processServerMsgQueue();
                });
            }
            return;
        }
        if (this.outputStream) {
            const json = JSON.stringify(message);
            this.outputStream.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}${TWO_CRLF}${json}`, 'utf8');
        }
    }

    protected connect(readable: stream.Readable, writable: stream.Writable): void {
        this.outputStream = writable;
        this.rawData = Buffer.allocUnsafe(0);
        this.contentLength = -1;
        this.inputStream = readable;
        this.inputStream.on('data', (data: Buffer) => this.handleData(data));
    }

    protected handleData(data: Buffer): void {
        this.rawData = Buffer.concat([this.rawData, data]);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (this.contentLength >= 0) {
                if (this.rawData.length >= this.contentLength) {
                    const msgData = this.rawData.toString('utf8', 0, this.contentLength);
                    this.rawData = this.rawData.slice(this.contentLength);
                    this.contentLength = -1;
                    if (msgData.length > 0) {
                        if (!this.handleMessageFromServer) {
                            throw new Error('handleMessageFromServer is undefined');
                        }
                        try {
                            const message = JSON.parse(msgData);
                            this.log(this.logServerToProxy, this.getLogObj(message), '---SERVER->PROXY:');
                            try {
                                this.handleMessageFromServer(message);
                            } catch (e) {
                                this.logerror(e, `Error handling message from server: ${message}`);
                            }
                        } catch (e) {
                            this.logerror(e, `Received invalid JSON message: ${msgData}`);
                        }
                    }
                    continue; // there may be more complete messages to process
                }
            } else {
                const idx = this.rawData.indexOf(TWO_CRLF);
                if (idx !== -1) {
                    const header = this.rawData.toString('utf8', 0, idx);
                    const lines = header.split(HEADER_LINESEPARATOR);
                    for (const h of lines) {
                        const kvPair = h.split(HEADER_FIELDSEPARATOR);
                        if (kvPair[0] === 'Content-Length') {
                            this.contentLength = Number(kvPair[1]);
                        }
                    }
                    this.rawData = this.rawData.slice(idx + TWO_CRLF.length);
                    continue;
                }
            }
            break;
        }
    }

    protected _isRunningInline() {
        return this._sendMessage && this._sendMessage.hasListener();
    }

    protected setClientCapabilities(args: DAP.InitializeRequestArguments) {
        const nargs = (Object.assign({}, args)) as ClientCapabilities;
        if (typeof args.adapterID !== 'string') {
            nargs.adapterID = DEFAULT_CLIENT_CAPABILITIES.adapterID;
        }
        if (typeof args.linesStartAt1 !== 'boolean') {
            nargs.linesStartAt1 = DEFAULT_CLIENT_CAPABILITIES.linesStartAt1;
        }
        if (typeof args.columnsStartAt1 !== 'boolean') {
            nargs.columnsStartAt1 = DEFAULT_CLIENT_CAPABILITIES.columnsStartAt1;
        }
        if (typeof args.pathFormat !== 'string') {
            nargs.pathsAreURIs = DEFAULT_CLIENT_CAPABILITIES.pathsAreURIs;
            nargs.pathFormat = DEFAULT_CLIENT_CAPABILITIES.pathFormat;
        } else {
            nargs.pathsAreURIs = args.pathFormat === 'uri';
            nargs.pathFormat = args.pathFormat;
        }
        if (typeof args.supportsVariableType !== 'boolean') {
            nargs.columnsStartAt1 = DEFAULT_CLIENT_CAPABILITIES.supportsVariableType;
        }
        // set the rest
        this.clientCaps = nargs;
        args.adapterID = this.clientCaps.adapterID;
        args.columnsStartAt1 = this.debuggerLocale.columnsStartAt1;
        args.linesStartAt1 = this.debuggerLocale.linesStartAt1;
        args.pathFormat = this.debuggerLocale.pathsAreURIs ? 'uri' : 'path';
    }

    // formatting
    protected static _formatPIIRegexp = /{([^}]+)}/g;
    protected static formatPII(format: string, excludePII: boolean, args: { [key: string]: string }): string {
        return format.replace(DebugAdapterProxy._formatPIIRegexp, function (match, paramName) {
            if (excludePII && paramName.length > 0 && paramName[0] !== '_') {
                return match;
            }
            return args[paramName] && args.hasOwnProperty(paramName) ? args[paramName] : match;
        });
    }

    convertClientLineToDebugger(line: number) {
        if (this.debuggerLocale.linesStartAt1) {
            return this.clientCaps.linesStartAt1 ? line : line + 1;
        }
        return this.clientCaps.linesStartAt1 ? line - 1 : line;
    }
    convertDebuggerLineToClient(line: number) {
        if (this.debuggerLocale.linesStartAt1) {
            return this.clientCaps.linesStartAt1 ? line : line - 1;
        }
        return this.clientCaps.linesStartAt1 ? line + 1 : line;
    }
    convertClientColumnToDebugger(column: number) {
        if (this.debuggerLocale.columnsStartAt1) {
            return this.clientCaps.columnsStartAt1 ? column : column + 1;
        }
        return this.clientCaps.columnsStartAt1 ? column - 1 : column;
    }
    convertDebuggerColumnToClient(column: number) {
        if (this.debuggerLocale.columnsStartAt1) {
            return this.clientCaps.columnsStartAt1 ? column : column - 1;
        }
        return this.clientCaps.columnsStartAt1 ? column + 1 : column;
    }

    convertClientPathToDebugger(clientPath: string) {
        if (this.clientCaps.pathsAreURIs !== this.debuggerLocale.pathsAreURIs) {
            if (this.clientCaps.pathsAreURIs) {
                return this.uri2path(clientPath);
            } else {
                return this.path2uri(clientPath);
            }
        }
        return clientPath;
    }

    convertDebuggerPathToClient(debuggerPath: string) {
        if (this.debuggerLocale.pathsAreURIs !== this.clientCaps.pathsAreURIs) {
            if (this.debuggerLocale.pathsAreURIs) {
                return this.uri2path(debuggerPath);
            } else {
                return this.path2uri(debuggerPath);
            }
        }
        return debuggerPath;
    }

    path2uri(path: string) {
        if (process.platform === 'win32') {
            if (/^[A-Z]:/.test(path)) {
                path = path[0].toLowerCase() + path.substr(1);
            }
            path = path.replace(/\\/g, '/');
        }
        path = encodeURI(path);
        const uri = new url.URL(`file:`); // ignore 'path' for now
        uri.pathname = path; // now use 'path' to get the correct percent encoding (see https://url.spec.whatwg.org)
        return uri.toString();
    }
    uri2path(sourceUri: string) {
        const uri = new url.URL(sourceUri);
        let s = decodeURIComponent(uri.pathname);
        if (process.platform === 'win32') {
            if (/^\/[a-zA-Z]:/.test(s)) {
                s = s[1].toLowerCase() + s.substr(2);
            }
            s = s.replace(/\//g, '\\');
        }
        return s;
    }

    // ---- implements vscode.Debugadapter interface ---------------------------

    // this is the event that the debug adapter client (i.e. vscode) will listen
    // to whenever we get a message from the server.
    public onDidSendMessage = this._sendMessage.event;

    // handle message from client to server
    public handleMessage(message: DebugProtocolMessage): void {
        if (!this.handleMessageFromClient) {
            throw new Error('handleMessageFromClient is undefined');
        }

        this.log(this.logClientToProxy, this.getLogObj(message as DAP.ProtocolMessage), '---CLIENT->PROXY:');
        if ((message as DAP.ProtocolMessage)?.type === 'request' && (message as DAP.Request)?.command === 'initialize') {
            this.setClientCapabilities((message as DAP.InitializeRequest).arguments);
        }
        if (this.currentState !== DebugAdapterProxyState.Connected) {
            // check if it's a disconnect request
            if ((message as DAP.ProtocolMessage)?.type === 'request' && (message as DAP.Request)?.command === 'disconnect') {
                let response = new Response(message as DAP.Request);
                response.success = true;
                this.sendMessageToClient(response);
                this.stop();
                return;
            }
            this._onConnected.once(() => {
                if (!this.handleMessageFromClient) {
                    throw new Error('handleMessageFromClient is undefined');
                }
                this.handleMessageFromClient(message as DAP.ProtocolMessage);
            });
            return;
        }
        this.handleMessageFromClient(message as DAP.ProtocolMessage);
    }

    public dispose() {
        this.stop();
    }
}
