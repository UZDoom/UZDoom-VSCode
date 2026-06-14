import { npath, ppath } from '@yarnpkg/fslib';
import * as vscode from 'vscode';

import { PK3_EXTENSIONS, PK3_SCHEME } from '../pk3-provider/common';
import { WAD_EXTENSIONS, WAD_SCHEME } from '../wad-provider/common';

export function getSchemeForArchivePath(path: string): string | undefined {
    if (PK3_EXTENSIONS.includes(npath.extname(path))) {
        return PK3_SCHEME;
    }
    if (WAD_EXTENSIONS.includes(npath.extname(path))) {
        return WAD_SCHEME;
    }
    return undefined;
}

export function pathToURI(scheme: string, pk3_path: string, file_path: string = ''): vscode.Uri {
    let portable_path = ppath.join(npath.toPortablePath(pk3_path), npath.toPortablePath(file_path));
    let result = vscode.Uri.from({
        scheme: scheme,
        path: portable_path
    })
    return result;
}

export function URIToPath(uri: vscode.Uri): string {
    return uri.fsPath;
}

function findArchiveEndIndex(path: string, extensions: string[]): number {
    let ext = npath.extname(path);
    if (extensions.includes(ext)) {
        return path.length;
    }
    let found = 0;
    for (let i = 0; i < extensions.length; i++) {
        let ext_index = path.indexOf(extensions[i] + '/');
        if (ext_index !== -1) {
            ext_index += extensions[i].length + 1;
            if (found === 0 || ext_index < found) {
                found = ext_index;
            }
        }
    }
    return found;
}

export function URIToArchivePathParts(uri: vscode.Uri, max_splits: number = -1, extensions: string[] = WAD_EXTENSIONS.concat(PK3_EXTENSIONS)): string[] {
    return PathToArchivePathParts(uri.fsPath, max_splits, extensions);
}

export function PathToArchivePathParts(p_path: string, max_splits: number = -1, extensions: string[] = WAD_EXTENSIONS.concat(PK3_EXTENSIONS)): string[] {
    let path = npath.toPortablePath(p_path).toString();
    let archive_paths: string[] = [];
    let archive_end_index = 0;
    let splits = 0;
    while ((max_splits < 0 || splits++ < max_splits) && (archive_end_index = findArchiveEndIndex(path, extensions)) !== 0) {
        let archive_path = path.substring(0, archive_end_index)
        if (archive_path.endsWith('/')) {
            archive_path = archive_path.substring(0, archive_path.length - 1);
        }
        archive_paths.push(archive_path);
        path = path.substring(archive_end_index);
    }
    return [...archive_paths, path];
}
