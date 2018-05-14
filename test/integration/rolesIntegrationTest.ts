import * as http from 'http';
import * as path from 'path';
import { makeFetch } from 'supertest-fetch';
import * as exegesis from 'exegesis';
import exegesisRolesPlugin from '../../src';
import { expect } from 'chai';

async function sessionAuthenticator(
    context: exegesis.ExegesisPluginContext
) : Promise<exegesis.AuthenticationResult | undefined> {
    const session = context.req.headers.session;
    if(!session || typeof(session) !== 'string') {
        return undefined;
    }
    if(session === 'lame') {
        return {
            type: 'success',
            user: {name: 'Mr. Lame'},
            roles: []
        };
    } else if(session === 'secret') {
        return {
            type: 'success',
            user: {name: 'jwalton'},
            roles: ['readWrite', 'admin']
        };
    } else {
        return undefined;
    }
}

async function createServer(allowedRoles=['admin', 'readWrite']) {
    const options : exegesis.ExegesisOptions = {
        controllers: path.resolve(__dirname, './controllers'),
        authenticators: {
            sessionKey: sessionAuthenticator
        },
        controllersPattern: "**/*.ts",
        plugins: [
            exegesisRolesPlugin({allowedRoles})
        ]
    };

    const middleware = await exegesis.compileApi(
        path.resolve(__dirname, './openapi.yaml'),
        options
    );

    const server = http.createServer(
        (req, res) =>
            middleware!(req, res, (err) => {
                if(err) {
                    console.error(err.stack); // tslint:disable-line no-console
                    res.writeHead(500);
                    res.end(`Internal error: ${err.message}`);
                } else {
                    res.writeHead(404);
                    res.end();
                }
            })
    );

    return server;
}

describe('integration test', function() {
    beforeEach(async function() {
        this.server = await createServer();
    });

    afterEach(function() {
        if(this.server) {this.server.close();}
    });

    it('should error if you try to use a role that is not in allowedRoles', async function() {
        try {
            await createServer(['a', 'b']);
            expect.fail('Should have thrown an error.');
        } catch(err) {
            expect(err.message).to.equal('Unknown role admin - should be one of: a, b.');
        }
    });

    it('should call a route that requires no roles', async function() {
        const fetch = makeFetch(this.server);
        await fetch(`/roleFree`, {
            headers: {session: 'lame'}
        })
            .expect(200);
    });

    it('should call a route that requires roles', async function() {
        const fetch = makeFetch(this.server);
        await fetch(`/greet`, {
            headers: {session: 'secret'}
        })
            .expect(200);
    });

    it('should not allow access if roles are missing', async function() {
        const fetch = makeFetch(this.server);
        await fetch(`/greet`, {
            headers: {session: 'lame'}
        })
            .expect(403);
    });

});
