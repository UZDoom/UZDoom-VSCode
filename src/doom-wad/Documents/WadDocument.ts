export default class WadDocument {
    protected _uri: any;
    protected data: ArrayBuffer;
    protected extra: any;

    constructor(uri: any, data: ArrayBuffer, extra: any) {
        this.uri = uri;
        this.data = data;
        this.extra = extra;
    }

    get uri(): any {
        return this._uri;
    }

    set uri(value: any) {
        this._uri = value;
    }

    async getDisplayContent(): Promise<ArrayBuffer> {
        return this.data;
    }

    dispose(): void {
    }
}
