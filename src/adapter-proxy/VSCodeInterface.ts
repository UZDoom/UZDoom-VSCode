import * as vscode from 'vscode';
import { FileAccessor } from './IDEInterface';
import path from 'path';
import { glob as _glob } from 'glob';
import { promisify } from 'util';

const glob = promisify(_glob);


function pathToUri(path: string) {
    try {
        return vscode.Uri.file(path);
    } catch (e) {
        return vscode.Uri.parse(path);
    }
}
export class VSCodeFileAccessor implements FileAccessor {
    isWindows: boolean = typeof process !== 'undefined' && process.platform === 'win32';

    async isDirectory(path: string): Promise<boolean> {
        let uri: vscode.Uri;
        try {
            uri = pathToUri(path);
            return await vscode.workspace.fs.stat(uri).then(stat => stat.type === vscode.FileType.Directory);
        } catch (e) {
            return false;
        }
    }

    async isFile(path: string): Promise<boolean> {
        let uri: vscode.Uri;
        try {
            uri = pathToUri(path);
            return await vscode.workspace.fs.stat(uri).then(stat => stat.type === vscode.FileType.File);
        } catch (e) {
            return false;
        }
    }

    async readDirectory(path: string): Promise<[string, vscode.FileType][]> {
        return await vscode.workspace.fs.readDirectory(pathToUri(path));
    }

    async readFile(path: string): Promise<Uint8Array> {
        return await vscode.workspace.fs.readFile(pathToUri(path));
    }

    async writeFile(path: string, contents: Uint8Array) {
        await vscode.workspace.fs.writeFile(pathToUri(path), contents);
    }

    async findFiles(include: string, exclude: string, maxResults: number, absolute: boolean = true, roots?: string[]): Promise<string[]> {
        let thing = (await vscode.workspace.findFiles(include, exclude, maxResults, undefined)).map(uri => uri.fsPath);
        let workspaceFolders: string[] = [];
        let _roots = roots && roots !== undefined ? roots : [];

        if (vscode.workspace.workspaceFolders) {
            for (let i = 0; i < vscode.workspace.workspaceFolders?.length; i++) {
                workspaceFolders.push(vscode.workspace.workspaceFolders[i].uri.fsPath);
            }
        }
        if (_roots && _roots.length > 0) {
            // make the roots absolute
            _roots = _roots.map(root => path.resolve(root));
            thing = thing.filter(path => _roots.some(root => path.startsWith(root)));
            // check if any of the roots are not in the workspaceFolders
            if (workspaceFolders.length > 0) {
                let notInWorkspaceFolders = _roots.filter(root => !workspaceFolders.includes(root));
                if (notInWorkspaceFolders.length > 0) {
                    // get the files in the notInWorkspaceFolders
                    for (let i = 0; i < notInWorkspaceFolders.length; i++) {
                        let root = notInWorkspaceFolders[i];
                        try {
                            let files = await glob(include, {
                                ignore: exclude,
                                absolute: absolute,
                                cwd: root
                            });
                            thing = thing.concat(files);
                        } catch (e) {
                            console.error(`Error finding files in ${root}: ${e}`);
                        }
                    }
                }
            }
        } else {
            _roots = workspaceFolders;
        }
        // sort the _roots array by length, such that the longest root is first
        _roots.sort((a, b) => b.length - a.length);

        if (!absolute && _roots.length > 0) {
            // find the root that is the longest match
            return thing.map(path => {
                let root = _roots.find(root => path.startsWith(root));
                if (root) {
                    return path.substring(root.length);
                }
                return path;
            });
        }
        return thing;
    }
}
