// tests for the one-line messages made from thrown values and zod errors
import { expect, test } from 'bun:test'
import { z } from 'zod'
import { describeError, describeZodError } from './error-messages'

test('describeError returns the message of an Error and the string form of anything else', () => {
  expect(describeError(new Error('the disk is full'))).toBe('the disk is full')
  expect(describeError('plain text')).toBe('plain text')
  expect(describeError(42)).toBe('42')
})

test('describeZodError names each failing path, with (root) for the top level', () => {
  // a number where an object with a string name is expected
  const rootResult = z.object({ name: z.string() }).safeParse(7)
  expect(rootResult.success).toBe(false)
  if (!rootResult.success) {
    expect(describeZodError(rootResult.error)).toMatch(/^\(root\): /)
  }

  // two failing fields, one nested
  const fieldsResult = z
    .object({ name: z.string(), source: z.object({ kind: z.literal('git') }) })
    .safeParse({ name: 1, source: { kind: 'other' } })
  expect(fieldsResult.success).toBe(false)
  if (!fieldsResult.success) {
    const message = describeZodError(fieldsResult.error)
    expect(message).toMatch(/^name: .+, source\.kind: .+$/)
  }
})
