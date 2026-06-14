import { VirtualFS, PosixFS, npath } from '@yarnpkg/fslib';
import { ZipOpenFS } from '@yarnpkg/libzip';
import * as vscode from 'vscode';

import { PK3_EXTENSIONS, PK3_SCHEME } from './common';
import { pathToURI, URIToPath } from '../common/ProviderHelpers';

export class Pk3FSProvider implements vscode.FileSystemProvider {
    public static readonly PK3_EXTENSIONS = PK3_EXTENSIONS;

    private readonly fs = new PosixFS(
        new VirtualFS({
            baseFs: new ZipOpenFS({
                useCache: true,
                maxOpenFiles: 200,
                fileExtensions: PK3_EXTENSIONS
            }),
        }),
    );

    static handlesArchive(path: vscode.Uri | string): boolean {
        path = typeof path === 'string' ? path : path.fsPath;
        const ext = npath.extname(path);
        return PK3_EXTENSIONS.includes(ext);
    }

    static pathToURI(pk3_path: string, file_path: string = ''): vscode.Uri {
        return pathToURI(PK3_SCHEME, pk3_path, file_path);
    }

    static URIToPath(uri: vscode.Uri): string {
        return URIToPath(uri);
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const stat: any = this.fs.statSync(uri.fsPath);
        let isDir = stat.isDirectory() || PK3_EXTENSIONS.includes(npath.extname(uri.fsPath));
        switch (true) {
            case isDir: {
                stat.type = vscode.FileType.Directory;
            } break;

            case stat.isFile(): {
                stat.type = vscode.FileType.File;
            } break;

            case stat.isSymbolicLink(): {
                stat.type = vscode.FileType.SymbolicLink;
            } break;

            default: {
                stat.type = vscode.FileType.Unknown;
            } break;
        }

        return stat;
    }

    readDirectory(uri: vscode.Uri): Array<[string, vscode.FileType]> {
        const listing = this.fs.readdirSync(uri.fsPath);

        return listing.map(entry => {
            const { type } = this.stat(vscode.Uri.joinPath(uri, entry));
            return [entry, type];
        });
    }

    readFile(uri: vscode.Uri): Uint8Array {
        try {
            return this.fs.readFileSync(uri.fsPath);
        } catch (e) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void {
        if (!options.create && !this.fs.existsSync(uri.fsPath))
            throw vscode.FileSystemError.FileNotFound(uri);
        if (options.create && !options.overwrite && this.fs.existsSync(uri.fsPath))
            throw vscode.FileSystemError.FileExists(uri);

        this.fs.writeFileSync(uri.fsPath, Buffer.from(content));
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
        throw new Error(`Not supported`);
    }

    delete(uri: vscode.Uri, options: { recursive: boolean }): void {
        this.fs.removeSync(uri.fsPath, options);
    }

    createDirectory(uri: vscode.Uri): void {
        this.fs.mkdirSync(uri.fsPath);
    }

    private _emitter = new vscode.EventEmitter<Array<vscode.FileChangeEvent>>();
    readonly onDidChangeFile = this._emitter.event;

    watch(resource: vscode.Uri, opts: any): vscode.Disposable {
        return new vscode.Disposable(() => { });
    }
}
