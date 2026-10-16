// runs a command's work under a watch for SIGINT and SIGTERM. the first signal cancels the work and exits with 128 plus the signal number
import { constants as osConstants } from 'node:os'

// where the signal listeners go: the process, or an event emitter in tests
export interface SignalSource {
  on(signal: NodeJS.Signals, listener: () => void): unknown
  off(signal: NodeJS.Signals, listener: () => void): unknown
}

// how the watched work ended: on its own with its value, or cancelled by a signal with the exit status
export type RunOutcome<T> =
  | { kind: 'finished'; value: T }
  | { kind: 'cancelled'; exitCode: number }

// the work and the cancel to run on a signal. the source and the exit are replaced in tests
export interface RunUntilSignalOptions<T> {
  run: () => Promise<T>
  cancel: (signal: NodeJS.Signals) => Promise<void>
  signalSource?: SignalSource
  exit?: (exitCode: number) => void
  signals?: NodeJS.Signals[]
}

// the signals the watch listens for unless the caller names others
const defaultSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']

/**
 * Races the work against the first signal. On a signal it awaits the cancel, calls exit with 128 plus the signal number and resolves the cancelled outcome.
 */
export async function runUntilSignal<T>({
  run,
  cancel,
  signalSource = process,
  exit = (exitCode) => process.exit(exitCode),
  signals = defaultSignals,
}: RunUntilSignalOptions<T>): Promise<RunOutcome<T>> {
  // listen for the first signal. a later one during the cleanup is ignored
  const signalWatch = watchSignals({ signalSource, signals })

  // race the work against the signal. the listeners go either way
  try {
    const raceOutcome = await Promise.race([
      run().then((value) => ({ kind: 'finished' as const, value })),
      signalWatch.firstSignal.then((signal) => ({
        kind: 'signalled' as const,
        signal,
      })),
    ])
    if (raceOutcome.kind === 'finished') {
      return raceOutcome
    }

    // cancel the work. then exit with the status a shell gives a signal
    await cancel(raceOutcome.signal)
    const exitCode = 128 + osConstants.signals[raceOutcome.signal]
    exit(exitCode)
    return { kind: 'cancelled', exitCode }
  } finally {
    signalWatch.stop()
  }
}

// the source to listen on and the signals to listen for
interface WatchSignalsOptions {
  signalSource: SignalSource
  signals: NodeJS.Signals[]
}

// the first signal seen and a way to stop listening
interface SignalWatch {
  firstSignal: Promise<NodeJS.Signals>
  stop(): void
}

// install one listener per signal that resolves the first signal seen
function watchSignals({
  signalSource,
  signals,
}: WatchSignalsOptions): SignalWatch {
  const { promise: firstSignal, resolve: resolveFirstSignal } =
    Promise.withResolvers<NodeJS.Signals>()
  const listenersBySignal = new Map(
    signals.map(
      (signal) => [signal, () => resolveFirstSignal(signal)] as const,
    ),
  )
  for (const [signal, listener] of listenersBySignal) {
    signalSource.on(signal, listener)
  }
  return {
    firstSignal,
    stop() {
      for (const [signal, listener] of listenersBySignal) {
        signalSource.off(signal, listener)
      }
    },
  }
}
