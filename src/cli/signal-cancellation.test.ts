// tests the signal watch over an event emitter: the exit status per signal, the listeners removed and an error passed through
import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { runUntilSignal } from './signal-cancellation'

// a run that never ends on its own
function runForever(): Promise<string> {
  return new Promise(() => {})
}

// one watched run with the signal it got, what cancel saw and what exit got
interface SignalledRun {
  outcome: Awaited<ReturnType<typeof runUntilSignal<string>>>
  cancelledSignals: string[]
  exitCodes: number[]
  signalSource: EventEmitter
}

// run forever under the watch and send the signal once the listeners are in place
async function runUntilEmitted(signal: NodeJS.Signals): Promise<SignalledRun> {
  const signalSource = new EventEmitter()
  const cancelledSignals: string[] = []
  const exitCodes: number[] = []
  queueMicrotask(() => {
    signalSource.emit(signal)
  })
  const outcome = await runUntilSignal({
    run: runForever,
    cancel: async (cancelledSignal) => {
      cancelledSignals.push(cancelledSignal)
    },
    signalSource,
    exit: (exitCode) => {
      exitCodes.push(exitCode)
    },
  })
  return { outcome, cancelledSignals, exitCodes, signalSource }
}

describe('runUntilSignal', () => {
  test('cancels on SIGINT and exits 130', async () => {
    const signalledRun = await runUntilEmitted('SIGINT')
    expect(signalledRun.outcome).toEqual({ kind: 'cancelled', exitCode: 130 })
    expect(signalledRun.cancelledSignals).toEqual(['SIGINT'])
    expect(signalledRun.exitCodes).toEqual([130])
    expect(signalledRun.signalSource.listenerCount('SIGINT')).toBe(0)
    expect(signalledRun.signalSource.listenerCount('SIGTERM')).toBe(0)
  })

  test('cancels on SIGTERM and exits 143', async () => {
    const signalledRun = await runUntilEmitted('SIGTERM')
    expect(signalledRun.outcome).toEqual({ kind: 'cancelled', exitCode: 143 })
    expect(signalledRun.cancelledSignals).toEqual(['SIGTERM'])
    expect(signalledRun.exitCodes).toEqual([143])
  })

  test('ignores a second signal during the cleanup', async () => {
    // a cancel that sends another signal while it runs
    const signalSource = new EventEmitter()
    const cancelledSignals: string[] = []
    const exitCodes: number[] = []
    queueMicrotask(() => {
      signalSource.emit('SIGINT')
    })
    const outcome = await runUntilSignal({
      run: runForever,
      cancel: async (signal) => {
        cancelledSignals.push(signal)
        signalSource.emit('SIGTERM')
      },
      signalSource,
      exit: (exitCode) => {
        exitCodes.push(exitCode)
      },
    })

    // only the first signal counts
    expect(outcome).toEqual({ kind: 'cancelled', exitCode: 130 })
    expect(cancelledSignals).toEqual(['SIGINT'])
    expect(exitCodes).toEqual([130])
  })

  test('returns the value and removes the listeners when the run ends on its own', async () => {
    const signalSource = new EventEmitter()
    const exitCodes: number[] = []
    const outcome = await runUntilSignal({
      run: async () => 'done',
      cancel: async () => {},
      signalSource,
      exit: (exitCode) => {
        exitCodes.push(exitCode)
      },
    })

    expect(outcome).toEqual({ kind: 'finished', value: 'done' })
    expect(exitCodes).toEqual([])
    expect(signalSource.listenerCount('SIGINT')).toBe(0)
    expect(signalSource.listenerCount('SIGTERM')).toBe(0)
  })

  test('passes an error of the run through and removes the listeners', async () => {
    const signalSource = new EventEmitter()
    const watchedRun = runUntilSignal({
      run: async () => {
        throw new Error('the run broke')
      },
      cancel: async () => {},
      signalSource,
      exit: () => {},
    })

    await expect(watchedRun).rejects.toThrow('the run broke')
    expect(signalSource.listenerCount('SIGINT')).toBe(0)
  })
})
