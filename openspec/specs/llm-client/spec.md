# llm-client Specification

## Purpose
Gives every module one way to ask a model for structured output, with the model chosen by configuration and every call cached, priced and audited so benchmark reruns are reproducible.

## Requirements

### Requirement: Structured generate call
The client SHALL send the system and user text to the configured model and return output validated against the caller's schema, with usage, cost, cache hit flag and duration. It SHALL use temperature 0 and SHALL never enable tools. A model id SHALL be `anthropic/<model>` or `fireworks/<model>`, and a per-call model id SHALL override the configured one.

#### Scenario: Valid response
- **WHEN** the model returns output that matches the schema
- **THEN** generate returns that output with its token usage, cost, `isCacheHit` false and a duration

#### Scenario: Unknown provider prefix
- **WHEN** the model id does not start with `anthropic/` or `fireworks/`
- **THEN** generate throws an error naming the model id

### Requirement: Response cache
When caching is enabled, the client SHALL key each request by the sha256 of the model id, prompt hash, system text, user text and the schema's JSON form, and SHALL store the raw validated response at `llm/<key>.json` under the cache directory. A request whose key is cached SHALL skip the network and cost 0.

#### Scenario: Cache miss then hit
- **WHEN** the same request is generated twice with caching enabled
- **THEN** the first call reaches the provider and the second does not, returns the same output, has `isCacheHit` true and `costUsd` 0

#### Scenario: Any input change misses
- **WHEN** the prompt hash, system text, user text, schema or model id differs from a cached request
- **THEN** the call reaches the provider

#### Scenario: Caching disabled
- **WHEN** caching is disabled
- **THEN** every call reaches the provider and nothing is written under the cache directory

### Requirement: Cost accounting
The client SHALL compute cost as input tokens times the model's input price plus output tokens times its output price, both per million tokens, from the configured price map. A model with no price SHALL log a warning and return `costUsd` null, never fail the call.

#### Scenario: Priced model
- **WHEN** a call uses 1000 input and 500 output tokens on a model priced 3 and 15 USD per million
- **THEN** costUsd is 0.0105

#### Scenario: Unpriced model
- **WHEN** a call uses a model absent from the price map
- **THEN** the call succeeds, costUsd is null and a warning names the model

### Requirement: Transient error retry
The client SHALL retry a call that fails with HTTP status 429 or any 5xx status up to 3 times with increasing waits. Any other error, or a fourth transient failure, SHALL be thrown.

#### Scenario: Rate limited then success
- **WHEN** the provider answers 429 twice and then succeeds
- **THEN** generate returns the successful output

#### Scenario: Retries exhausted
- **WHEN** the provider answers 503 four times
- **THEN** generate throws an error with status 503 after 4 attempts

#### Scenario: Client error not retried
- **WHEN** the provider answers 400
- **THEN** generate throws after 1 attempt

### Requirement: Validation retry
When the model output fails the schema, the client SHALL retry once with the validation error appended to the user text. A second failure SHALL throw a typed validation error naming the prompt id and the model id.

#### Scenario: Second attempt valid
- **WHEN** the first output fails the schema and the second passes
- **THEN** generate returns the second output and the second request's user text contains the validation error

#### Scenario: Both attempts invalid
- **WHEN** both outputs fail the schema
- **THEN** generate throws the typed validation error and nothing is cached

### Requirement: Call audit event
Every generate call SHALL write one `llm-call` audit event holding the model id, prompt id, prompt version, prompt hash, input hash, usage, cost, cache hit flag, duration and raw output. A call that throws SHALL still write its event, with the error message.

#### Scenario: Successful call audited
- **WHEN** generate succeeds
- **THEN** exactly one `llm-call` event is written, it parses against the audit event contract and its payload holds every listed field

#### Scenario: Failed call audited
- **WHEN** generate throws
- **THEN** one `llm-call` event is written with the error message

### Requirement: Fake provider
The module SHALL include a fake provider that returns canned outputs or errors keyed by prompt id, in order, so tests run with no network and no key.

#### Scenario: Canned output by prompt id
- **WHEN** the fake is given a canned output for prompt `code-review` and a client generates with that prompt id
- **THEN** the client returns the canned output without any network access
