"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const kleur = tslib_1.__importStar(require("kleur"));
const interface_1 = require("../../../interface");
const policy_1 = require("./policy");
/* use below functions to implement ProtocolPlugin.compileSchema methods */
exports.ConnectorCompiler = {
    map(schema, integration, opts) {
        // find path of connector schema from whole service schema
        const field = getPathOfPartialSchema(schema, integration.schema);
        const connector = integration.service.broker.createInlineFunction({
            function: schema,
            mappableKeys: opts.mappableKeys,
            reporter: integration.reporter.getChild({
                field: kleur.bold(kleur.cyan(field)),
                schema,
            }),
        });
        return withLabel(connector, `mapConnector`);
    },
    call(schema, integration, policyPlugins, opts) {
        const broker = integration.service.broker;
        // find path of connector schema from whole service schema
        const field = getPathOfPartialSchema(schema, integration.schema);
        // find action
        let action;
        const actionId = schema.action;
        // to map call params
        let paramsMapper;
        // to map response
        const responseMapper = schema.map ? broker.createInlineFunction({
            function: schema.map,
            mappableKeys: ["context", "action", "params", "response"],
            reporter: integration.reporter.getChild({
                field: kleur.bold(kleur.cyan(field + ".map")),
                schema: schema.map,
            }),
        }) : null;
        // to apply access control policy plugin
        const policies = integration.schema.policy && Array.isArray(integration.schema.policy.call)
            ? integration.schema.policy.call.filter(policy => policy.actions.some(actionNamePattern => broker.matchActionName(actionId, actionNamePattern)))
            : [];
        const baseArgs = { action: actionId };
        const connector = (context, mappableArgs, injectedParams) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            // dynamically load action before first call
            if (!action) {
                action = integration.findAction(actionId);
                if (!action) {
                    throw new Error(`action not found: ${actionId}`); // TODO: normalize error
                }
                // also create paramsMapper dynamically
                paramsMapper = broker.createParamsMapper({
                    explicitMappableKeys: opts.explicitMappableKeys,
                    explicitMapping: schema.params,
                    implicitMappableKeys: opts.implicitMappableKeys,
                    batchingEnabled: opts.batchingEnabled,
                    paramsSchema: action.paramsSchema,
                    reporter: integration.reporter.getChild({
                        field: kleur.bold(kleur.cyan(field + ".params")),
                        schema: schema.params,
                    }),
                });
            }
            // map params
            const { params, batchingParams } = paramsMapper.map(mappableArgs);
            // test policy
            const args = Object.assign(Object.assign({}, baseArgs), { context, params: Object.assign(Object.assign({}, params), batchingParams) });
            if (policy_1.testCallPolicy(policyPlugins, policies, args) !== true) {
                throw new Error("forbidden call"); // TODO: normalize error
            }
            // call
            const response = yield broker.call(context, {
                action,
                params: injectedParams ? Object.assign(params, injectedParams) : params,
                batchingParams,
                disableCache: opts.disableCache,
            });
            // map response
            return responseMapper ? responseMapper(Object.assign(Object.assign({}, args), { response })) : response;
        });
        return withLabel(connector, `callConnector`);
    },
    publish(schema, integration, policyPlugins, opts) {
        const broker = integration.service.broker;
        // find path of connector schema from whole service schema
        const field = getPathOfPartialSchema(schema, integration.schema);
        // to map event params
        const paramsMapper = broker.createParamsMapper({
            explicitMappableKeys: opts.mappableKeys,
            explicitMapping: schema.params,
            implicitMappableKeys: [],
            batchingEnabled: false,
            paramsSchema: null,
            reporter: integration.reporter.getChild({
                field: kleur.bold(kleur.cyan(field + ".params")),
                schema: schema.params,
            }),
        });
        // to filter packet
        const packetFilter = schema.filter ? broker.createInlineFunction({
            function: schema.filter,
            mappableKeys: ["context", "event", "broadcast", "params"],
            reporter: integration.reporter.getChild({
                field: kleur.bold(kleur.cyan(field + ".filter")),
                schema: schema.filter,
            }),
        }) : null;
        // to map response
        const responseMapper = schema.map ? broker.createInlineFunction({
            function: schema.map,
            mappableKeys: ["context", "event", "params", "groups", "broadcast"],
            reporter: integration.reporter.getChild({
                field: kleur.bold(kleur.cyan(field + ".map")),
                schema: schema.map,
            }),
        }) : null;
        // schema.event can be a constant (string) or inline function which should generate event names (string[])
        let eventNameOrFn;
        try {
            eventNameOrFn = broker.createInlineFunction({
                function: schema.event,
                mappableKeys: opts.mappableKeys,
                reporter: integration.reporter.getChild({
                    field: kleur.bold(kleur.cyan(field + ".event")),
                    schema: schema.event,
                }),
                returnTypeCheck: value => typeof value === "string" && !!value,
                returnTypeNotation: "string",
            });
        }
        catch (error) {
            eventNameOrFn = schema.event;
        }
        // for static event name
        if (typeof eventNameOrFn === "string") {
            const eventName = eventNameOrFn;
            const policies = integration.schema.policy && Array.isArray(integration.schema.policy.publish)
                ? integration.schema.policy.publish.filter(policy => policy.events.some(eventNamePattern => broker.matchEventName(eventName, eventNamePattern)))
                : [];
            const baseArgs = { event: eventName, groups: schema.groups || [], broadcast: schema.broadcast === true };
            const connector = (context, mappableArgs) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                // map params
                const { params } = paramsMapper.map(mappableArgs); // batching disabled
                // test policy
                const args = Object.assign(Object.assign({}, baseArgs), { context, params });
                if (policy_1.testPublishPolicy(policyPlugins, policies, args) !== true) {
                    throw new Error("forbidden publish"); // TODO: normalize error
                }
                // publish
                if (!packetFilter || packetFilter(args)) {
                    yield broker.publishEvent(context, args);
                }
                return responseMapper ? responseMapper(args) : args.params; // just return params only if mapper has not been defined
            });
            return withLabel(connector, `publishConnector`);
        }
        else {
            // for dynamic event name
            const getEventName = eventNameOrFn;
            const policies = integration.schema.policy && Array.isArray(integration.schema.policy.publish)
                ? integration.schema.policy.publish
                : [];
            const baseArgs = { groups: schema.groups || [], broadcast: schema.broadcast === true };
            const connector = (context, mappableArgs) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                // map params
                const { params } = paramsMapper.map(mappableArgs); // batching disabled
                // get event name
                const eventName = getEventName(mappableArgs);
                // test policy
                const args = Object.assign(Object.assign({}, baseArgs), { context, event: eventName, params });
                const filteredPolicies = policies.filter(policy => policy.events.some(eventNamePattern => broker.matchEventName(eventName, eventNamePattern)));
                if (policy_1.testPublishPolicy(policyPlugins, filteredPolicies, args) !== true) {
                    throw new Error("forbidden publish"); // TODO: normalize error
                }
                // publish
                yield broker.publishEvent(context, args);
                // map response
                return responseMapper ? responseMapper(args) : args.params; // just return params only if mapper has not been defined
            });
            return withLabel(connector, `publishConnector`);
        }
    },
    subscribe(schema, integration, policyPlugins, opts) {
        const broker = integration.service.broker;
        // find path of connector schema from whole service schema
        const field = getPathOfPartialSchema(schema, integration.schema);
        // to filter response
        const responseFilter = schema.filter ? broker.createInlineFunction({
            function: schema.filter,
            mappableKeys: ["context", "event", "broadcast", "params"],
            reporter: integration.reporter.getChild({
                field: kleur.bold(kleur.cyan(field + ".filter")),
                schema: schema.filter,
            }),
        }) : null;
        // to map response
        const responseMapper = schema.map ? broker.createInlineFunction({
            function: schema.map,
            mappableKeys: ["context", "event", "broadcast", "params"],
            reporter: integration.reporter.getChild({
                field: kleur.bold(kleur.cyan(field + ".map")),
                schema: schema.map,
            }),
        }) : null;
        // schema.event can be a constant (string) or inline function which should generate event names (string[])
        let eventNamesOrFn;
        if (typeof schema.events === "string") {
            eventNamesOrFn = broker.createInlineFunction({
                function: schema.events,
                mappableKeys: opts.mappableKeys,
                reporter: integration.reporter.getChild({
                    field: kleur.bold(kleur.cyan(field + ".events")),
                    schema: schema.events,
                }),
                returnTypeCheck: value => Array.isArray(value) && value.every(name => typeof name === "string" && name),
                returnTypeNotation: "string[]",
            });
        }
        else {
            eventNamesOrFn = schema.events;
        }
        const policies = integration.schema.policy && Array.isArray(integration.schema.policy.subscribe) ? integration.schema.policy.subscribe : [];
        const connector = (context, mappableArgs, listener) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const eventNames = Array.isArray(eventNamesOrFn) ? eventNamesOrFn : eventNamesOrFn(mappableArgs);
            const asyncIteratorComposeItems = [];
            for (const event of eventNames) {
                // test policy
                const filteredPolicies = policies.filter(policy => policy.events.some(eventNamePattern => broker.matchEventName(event, eventNamePattern)));
                const args = { context, event };
                if (policy_1.testSubscribePolicy(policyPlugins, filteredPolicies, args) !== true) {
                    throw new Error("forbidden subscribe"); // TODO: normalize error
                }
                if (opts.getAsyncIterator) {
                    // create async iterator
                    asyncIteratorComposeItems.push({
                        iterator: yield broker.subscribeEvent(context, event, null),
                        filter: responseFilter ? (packet => responseFilter(Object.assign({ context }, packet))) : undefined,
                        map: responseMapper ? (packet => responseMapper(Object.assign({ context }, packet))) : (packet => packet.params),
                    });
                }
                else {
                    // or, just subscribe with packet listener
                    const handler = (packet) => {
                        const responseArgs = Object.assign({ context }, packet);
                        // filter response
                        if (responseFilter && !responseFilter(responseArgs)) {
                            return;
                        }
                        // map response and call listener
                        listener(responseMapper ? responseMapper(responseArgs) : responseArgs.params); // just return params only if mapper has not been defined
                    };
                    yield broker.subscribeEvent(context, event, handler);
                }
            }
            // compose async iterators as one async iterator
            if (opts.getAsyncIterator) {
                return interface_1.composeAsyncIterators(asyncIteratorComposeItems);
            }
            return undefined;
        });
        return withLabel(connector, `subscribeConnector`);
    },
};
function withLabel(connector, label) {
    Object.defineProperty(connector, "name", { value: `${label}` });
    return connector;
}
function getPathOfPartialSchema(partialSchema, schema) {
    const path = recGetPathOfPartialSchema(partialSchema, schema, []);
    if (path) {
        return path;
    }
    // alternatively return location
    const lines = JSON.stringify(schema, null, 2).split(JSON.stringify(partialSchema, null, 2))[0].split("\n");
    const line = lines.length;
    const col = lines[lines.length - 1].length;
    return `${line}:${col}`;
}
function recGetPathOfPartialSchema(partialSchema, schema, keys) {
    for (const [k, v] of Object.entries(schema)) {
        if (v === partialSchema) {
            return keys.concat(k).join(".");
        }
        if (typeof v === "object" && v !== null) {
            const path = recGetPathOfPartialSchema(partialSchema, v, keys.concat(k));
            if (path) {
                return path;
            }
        }
    }
    return null;
}
//# sourceMappingURL=compiler.js.map