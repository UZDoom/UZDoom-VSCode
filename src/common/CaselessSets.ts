/**
 * A custom set implementation that allows for a custom comparator.
 */
export class CustomSet<T> implements Set<T> {
    private items: T[] = [];
    private comparator: (a: T, b: T) => boolean;
    constructor(comparator, iterable?: Iterable<T>) {
        // instance a Comparator object
        this.comparator = comparator || ((a, b) => a === b);
        for (const item of iterable || []) {
            this.add(item);
        }
    }


    add(item: T): this {
        if (!this.has(item)) {
            this.items.push(item);
        }
        return this;
    }

    has(item: T): boolean {
        return this.items.some(existingItem => this.comparator(item, existingItem));
    }

    get(item: T): T | undefined {
        return this.items.find(existingItem => this.comparator(item, existingItem));
    }

    delete(item: T): boolean {
        const index = this.items.findIndex(existingItem => this.comparator(item, existingItem));
        if (index > -1) {
            this.items.splice(index, 1);
            return true;
        }
        return false;
    }

    get size(): number {
        return this.items.length;
    }

    clear(): void {
        this.items = [];
    }

    [Symbol.iterator](): IterableIterator<T> {
        return this.items[Symbol.iterator]();
    }

    [Symbol.toStringTag]: string = 'CustomSet';

    forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void, thisArg?: any): void {
        this.items.forEach(item => callbackfn.call(thisArg, item, item, this));
    }

    entries(): IterableIterator<[T, T]> {
        return this.items.entries() as unknown as IterableIterator<[T, T]>;
    }

    keys(): IterableIterator<T> {
        return this.items.keys() as unknown as IterableIterator<T>;
    }

    values(): IterableIterator<T> {
        return this.items.values();
    }
}

/**
 * A case-insensitive string set implementation.
 */
export class CaselessSet extends CustomSet<string> {
    constructor(iterable?: Iterable<string>) {
        super((a, b) => a.toLowerCase() === b.toLowerCase(), iterable);
    }
}

/**
 * A custom map implementation that allows for a custom comparator.
 */
export class CustomMap<K, V> implements Map<K, V> {
    private items: { key: K; value: V }[] = [];
    private comparator: (a: K, b: K) => boolean;

    constructor(comparator: (a: K, b: K) => boolean, entries?: Iterable<[K, V]>) {
        this.comparator = comparator;
        if (entries) {
            for (const [key, value] of entries) {
                this.set(key, value);
            }
        }
    }

    clear(): void {
        this.items = [];
    }

    delete(key: K): boolean {
        const index = this.items.findIndex(item => this.comparator(item.key, key));
        if (index > -1) {
            this.items.splice(index, 1);
            return true;
        }
        return false;
    }

    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
        this.items.forEach(item => callbackfn.call(thisArg, item.value, item.key, this));
    }

    get(key: K): V | undefined {
        const item = this.items.find(item => this.comparator(item.key, key));
        return item?.value;
    }

    has(key: K): boolean {
        return this.items.some(item => this.comparator(item.key, key));
    }

    set(key: K, value: V): this {
        const index = this.items.findIndex(item => this.comparator(item.key, key));
        if (index > -1) {
            this.items[index].value = value;
        } else {
            this.items.push({ key, value });
        }
        return this;
    }

    get size(): number {
        return this.items.length;
    }

    entries(): IterableIterator<[K, V]> {
        return this.items.map(item => [item.key, item.value] as [K, V])[Symbol.iterator]();
    }

    keys(): IterableIterator<K> {
        return this.items.map(item => item.key)[Symbol.iterator]();
    }

    values(): IterableIterator<V> {
        return this.items.map(item => item.value)[Symbol.iterator]();
    }

    [Symbol.iterator](): IterableIterator<[K, V]> {
        return this.entries();
    }

    get [Symbol.toStringTag](): string {
        return 'CustomMap';
    }
}

/**
 * A case-insensitive string map implementation.
 */
export class CaselessMap<V> extends CustomMap<string, V> {
    constructor(iterable?: Iterable<[string, V]>) {
        const comparator = (a, b) => {
            return a.toLowerCase() === b.toLowerCase();
        }
        super(comparator, iterable);
    }
}
