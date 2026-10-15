# Spec Delta

## MODIFIED Requirements

### Requirement: Package name normalization
The shared module SHALL export one function that normalizes an npm package name by trimming surrounding whitespace and lowercasing it. A module that matches a package name against advisory data SHALL compare names through it. A module that records installed packages SHALL keep each exact name, because npm treats names that differ only in case as different packages.

#### Scenario: Case and whitespace
- **WHEN** `' Haraka '` and `'@XMLDom/XMLDom'` are normalized
- **THEN** the results are `'haraka'` and `'@xmldom/xmldom'`

#### Scenario: Already normalized
- **WHEN** an already normalized name is normalized again
- **THEN** it is returned unchanged

#### Scenario: Matching an installed name against advisories
- **WHEN** a lockfile records `Haraka` and the advisory data lists `Haraka`
- **THEN** a lookup by the recorded name finds that advisory
