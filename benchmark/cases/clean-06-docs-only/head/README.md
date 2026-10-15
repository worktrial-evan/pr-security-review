# benchmark fixture app

A small Bun web app with the routes a security review looks at: a sqlite read, a login that issues a JWT, an admin route, a template render, a file download, a redirect, an upload and a shell-out.

## Start

Set `JWT_SECRET` to any value and run `bun run start`. The app listens on port 3000 unless `PORT` says otherwise.

## Routes

- `GET /users/:id`: one user as json
- `GET /users/:id/profile`: the profile page of one user
- `POST /login`: a session token for a name and password
- `GET /admin`: a greeting for a bearer token with the admin role
- `GET /download?file=<path>`: one file from the public directory
- `GET /redirect?to=<path>`: a redirect to a path inside the app
- `POST /upload`: stores one uploaded file under a generated name
- `GET /health`: the host system name

## Fixture users

Two users are seeded on start: alice, an admin, and bob, a member.
