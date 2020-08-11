import semver from 'semver';
import * as oas3 from 'openapi3-ts';
import { ExegesisPluginContext, OAS3ApiInfo, ExegesisPluginInstance, ExegesisPlugin } from 'exegesis';
import jsonPtr from 'json-ptr';

const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE'];
const EXEGESIS_ROLES = 'x-exegesis-roles';

type RequiredRoles = string[][];

export interface RolesOptions {
    /**
     * A list of roles that are allowed to appear in 'x-exegesis-roles'.
     * If defined, an error will be thrown at compile time if there are any
     * roles used in the API that aren't in this list.
     */
    allowedRoles?: string[];

}

function resolveRef(document: any, ref: string | any) : any | undefined {
    if(typeof ref === 'string') {
        return resolveRefPriv(document, ref);
    } else if(ref.$ref) {
        return resolveRefPriv(document, ref.$ref);
    } else {
        return ref;
    }
}

function resolveRefPriv(document: any, ref: string) : any {
    if(!ref.startsWith('#/') && !ref.startsWith('/') && ref !== '') {
        throw new Error(`Cannot resolve non-local ref ${ref}`);
    }

    const path = jsonPtr.decode(ref);
    let currentDoc = document;
    while(path.length > 0) {
        const pathname = path.shift() as string;
        currentDoc = currentDoc && currentDoc[pathname];
        while(currentDoc && currentDoc.$ref) {
            currentDoc = resolveRefPriv(document, currentDoc.$ref);
        }
    }

    return currentDoc;
}

class RolesPlugin implements ExegesisPluginInstance {
    private readonly _options: RolesOptions;
    private readonly _rolesForPaths: {[path: string]: RequiredRoles} = {};
    private readonly _securitySchemesTypes: {[path: string]: oas3.SecuritySchemeType} = {};

    constructor(options: RolesOptions) {
        this._options = options;
    }

    preCompile(data: {apiDoc: any}) {
        const {apiDoc} = data;
        const securitySchemes = (apiDoc.components && apiDoc.components.securitySchemes) || {};

        for(const securitySchemeName of Object.keys(securitySchemes)) {
            this._securitySchemesTypes[securitySchemeName] = securitySchemes[securitySchemeName].type;
        }

        for(const path of Object.keys(apiDoc.paths)) {
            const pathItemObject = resolveRef(apiDoc, apiDoc.paths[path]);
            for(const method of HTTP_METHODS) {
                const operationObject : oas3.OperationObject = pathItemObject[method.toLowerCase()];
                if(!operationObject) { continue; }

                let requiredRoles = operationObject[EXEGESIS_ROLES] || apiDoc[EXEGESIS_ROLES];
                if(requiredRoles) {
                    const securityRequirements = operationObject.security || apiDoc.security;
                    if(!securityRequirements) {
                        throw new Error(`Path ${path} has operation ${method.toLowerCase()} with ` +
                            `required roles but no security requirements.`);
                    }

                    if(!Array.isArray(requiredRoles)) {
                        throw new Error(
                            `Exepected ${EXEGESIS_ROLES} in ${path}/${method.toLowerCase()} to be an array.`
                        );
                    }

                    // Turn it into an array of arrays of strings.
                    if(requiredRoles.every(m => typeof(m) === 'string')) {
                        requiredRoles = [requiredRoles];
                    } else {
                        requiredRoles = requiredRoles.map(m => Array.isArray(m) ? m : [m]);
                    }

                    for(const roles of requiredRoles) {
                        for(const role of roles) {
                            if(this._options.allowedRoles && !this._options.allowedRoles.includes(role)) {
                                throw new Error(
                                    `Unknown role ${role} - should be one of: ${this._options.allowedRoles.join(', ')}.`
                                );
                            }
                        }
                    }

                    if(requiredRoles.length > 0) {
                        const pathItemPtr = jsonPtr.encodePointer(['paths', path]);
                        this._rolesForPaths[`${pathItemPtr}/${method.toLowerCase()}`] = requiredRoles;
                    }
                }
            }
        }
    }

    postSecurity(context: ExegesisPluginContext) {
        const security = context.security;
        if(!security) {
            // No authenticated users.  We match roles against each
            // authenticated user, so there's no work for us to do here.
            return;
        }

        const api = (context.api as OAS3ApiInfo);
        const method = (context.req.method || '').toLowerCase();
        const requiredRoles = this._rolesForPaths[`${api.pathItemPtr}/${method}`];

        if(requiredRoles) {
            const schemes = Object.keys(security)
                .filter(schemeName => {
                    // Roles don't apply to oauth2
                    return this._securitySchemesTypes[schemeName] !== 'oauth2';
                });

            const badSchemes = schemes.filter(scheme => {
                const userRoles = security[scheme].roles || [];
                const userAllowed = requiredRoles.some(roles =>
                    roles.every(role => userRoles.includes(role))
                );
                return !userAllowed;
            });

            if(badSchemes.length > 0) {
                // TODO: Improve error message.
                context.res.setStatus(403)
                    .json({
                        message: `Authenticated with ${schemes.join(', ')} but missing one or more required roles.`
                    });
            }
        }
    }
}

export default function exegesisPluginRoles(options: RolesOptions) : ExegesisPlugin {
    return {
        info: {
            name: 'exgesis-plugin-roles'
        },
        makeExegesisPlugin(data: {apiDoc: any}) : ExegesisPluginInstance {
            const {apiDoc} = data;

            if(!apiDoc.openapi) {
                throw new Error("OpenAPI definition is missing 'openapi' field");
            }
            if(!semver.satisfies(apiDoc.openapi, '>=3.0.0 <4.0.0')) {
                throw new Error(`OpenAPI version ${apiDoc.openapi} not supported`);
            }

            return new RolesPlugin(options);
        }
    };
}