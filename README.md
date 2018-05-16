# exegesis-plugin-roles

[![Greenkeeper badge](https://badges.greenkeeper.io/exegesis-js/exegesis-plugin-roles.svg)](https://greenkeeper.io/)

[![NPM version](https://badge.fury.io/js/exegesis-plugin-roles.svg)](https://npmjs.org/package/exegesis-plugin-roles)
[![Build Status](https://travis-ci.org/exegesis-js/exegesis-plugin-roles.svg)](https://travis-ci.org/exegesis-js/exegesis-plugin-roles)
[![Coverage Status](https://coveralls.io/repos/exegesis-js/exegesis-plugin-roles/badge.svg)](https://coveralls.io/r/exegesis-js/exegesis-plugin-roles)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

## Description

Adds support for the "x-exegesis-roles" vendor extension, which adds support for
restricting which operations are available to which users after they have been
authenticated.  Authenticators can optionally return "roles" for a user.
"x-exegesis-roles" can be specified either as an array of "role" strings, or as
an array of such arrays.

For example:

```yaml
x-exegesis-roles:
  - a
  - b
```

would only allow access to an operation if a user has both the 'a' and 'b'
role, or:

```yaml
x-exegesis-roles:
  - [a]
  - [b, c]
```

would only allow access to an operation if a user has the 'a' role, or has
both the 'b' and 'c' role.

"x-exegesis-roles" can be defined on the root OpenAPI object, in which case
all operations in the document will require those roles.  This can be overridden
by specifying "x-exegesis-roles" in an individual operation.  An empty array
indicates a user requires no roles:

```yaml
x-exegesis-roles: []
```

If "x-exegesis-roles" is defined on an operation which has no security
requirements defined, this will throw an error.

Roles do not apply to security schemes with the "oauth2" type; scopes apply
there instead.

Allowed in:

* [OpenAPI Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.1.md#oasObject)
* [Operation Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.1.md#operationObject)

## Installation

```sh
npm install exegesis-plugin-roles
```

## Example

Add this to your Exegesis options:

```js
import exegesisRolesPlugin from 'exegesis-roles-plugin';

options = {
    plugins: [
        exegesisRolesPlugin({
            // List of all allowed roles.  If you try to use any roles that
            // aren't in this list in your document, an error will be thrown.
            allowedRoles: ['user', 'admin', 'ops']
        })
    ]
};
```

In your OpenAPI 3.x document:

```yaml
paths:
  '/kittens':
    get:
        description: Get a list of kittens
        security:
            - basicAuth: []
            - oauth: ['readOnly']
    post:
        description: Add a new kitten
        security:
            - basicAuth: []
            - oauth: ['readWrite']
        x-exegesis-roles: ['admin'] # Only users with the "admin" role may call this.
```

The "get" operation can only be executed if the request matches one of the two
listed security requirements.  The "post" operation can only be executed if
the security requirements are matched, and the current "user" has the "admin"
role.

Copyright 2018 Jason Walton