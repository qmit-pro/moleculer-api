import { Route } from "../server";
import { ServiceAPIIntegration } from "./integration";
export declare type VersionProps = {
    schemaHashMap: Map<string, Readonly<ServiceAPIIntegration>>;
    routeHashMap: Map<string, Readonly<Route>>;
    parentVersion: Readonly<Version> | null;
};
export declare class Version {
    protected readonly props: VersionProps;
    static readonly initialVersion: Version;
    readonly hash: string;
    readonly shortHash: string;
    private readonly $integrations;
    constructor(props: VersionProps);
    toString(): string;
    getChildVersionProps(): {
        schemaHashMap: Map<string, Readonly<ServiceAPIIntegration>>;
        routeHashMapCache: Readonly<Map<string, Readonly<Route>>>;
    };
    addIntegrationHistory(integration: Readonly<ServiceAPIIntegration>): void;
    forgetParentVersion(): void;
    get parentVersion(): Readonly<Version> | null;
    get routes(): Array<Readonly<Route>>;
    get integrations(): ReadonlyArray<Readonly<ServiceAPIIntegration>>;
    get derivedIntegrations(): ReadonlyArray<Readonly<ServiceAPIIntegration>>;
    getRetryableIntegrations(): Array<Readonly<ServiceAPIIntegration>>;
}
