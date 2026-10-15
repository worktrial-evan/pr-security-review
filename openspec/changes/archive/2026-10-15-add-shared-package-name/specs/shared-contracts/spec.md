# Spec Delta

## ADDED Requirements

### Requirement: Package name normalization
The shared module SHALL export one function that normalizes an npm package name by trimming surrounding whitespace and lowercasing it. Every module that keys or looks up data by npm package name SHALL use it.

#### Scenario: Case and whitespace
- **WHEN** `' Haraka '` and `'@XMLDom/XMLDom'` are normalized
- **THEN** the results are `'haraka'` and `'@xmldom/xmldom'`

#### Scenario: Already normalized
- **WHEN** an already normalized name is normalized again
- **THEN** it is returned unchanged
