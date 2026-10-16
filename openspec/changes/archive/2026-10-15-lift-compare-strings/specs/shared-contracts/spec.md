# Spec Delta

## ADDED Requirements

### Requirement: String comparison
The shared module SHALL export one function that compares two strings by code unit order and returns -1, 0 or 1, never depending on the locale. A module SHALL NOT keep a code unit string comparator of its own. Wherever it passes a comparator to order paths, names or ids by code unit, that comparator SHALL be this function. The default sort of a string array is also code unit order and needs no comparator.

#### Scenario: Order by code unit
- **WHEN** `'B.ts'` and `'a.ts'` are compared, and `'CWE-1321'` and `'CWE-20'`
- **THEN** `'B.ts'` comes first and `'CWE-1321'` comes first, because uppercase and the digit 1 have the lower code units

#### Scenario: Equal strings
- **WHEN** a string is compared with itself
- **THEN** the result is 0

#### Scenario: Prefix first
- **WHEN** `'src/a'` and `'src/a.ts'` are compared
- **THEN** `'src/a'` comes first
