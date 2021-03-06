import { RecursivePartial } from "../../interface";
import { Logger } from "../../logger";
import { Branch, Version } from "../../schema";
import { Route, ServerApplicationComponent, ServerApplicationComponentConstructorOptions, ServerApplicationComponentModules } from "./component";
import { APIRequestContextFactory } from "./context";
export declare type ServerApplicationProps = {
    logger: Logger;
    contextFactories: ReadonlyArray<APIRequestContextFactory<any>>;
};
export declare type ServerApplicationOptions = {} & ServerApplicationComponentConstructorOptions;
export declare class ServerApplication {
    protected readonly props: ServerApplicationProps;
    readonly components: ReadonlyArray<ServerApplicationComponent<Route>>;
    private readonly componentBranchHandlerMap;
    private readonly componentsAliasedVersions;
    private readonly staticRoutes;
    constructor(props: ServerApplicationProps, opts?: RecursivePartial<ServerApplicationOptions>);
    get componentModules(): ServerApplicationComponentModules;
    start(): Promise<void>;
    stop(): Promise<void>;
    private readonly lock;
    mountBranchHandler(branch: Branch): Promise<void>;
    unmountBranchHandler(branch: Branch): Promise<void>;
    addStaticRoute(route: Route): this;
    get routes(): {
        branch: Readonly<Branch>;
        version: Readonly<Version>;
        route: Readonly<Route>;
    }[];
}
