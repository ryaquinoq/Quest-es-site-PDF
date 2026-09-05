# Harness cleanup fix report

## Scope

Fixed only the intermittent Windows cleanup failure in
`tests/unit/harness.test.js` for the test `static server rejects traversal to a
sibling with a common path prefix`.

## Root cause

The cleanup hook called `child.kill()` and immediately removed the temporary
sandbox. `child.kill()` requests termination but does not wait for the child
process to exit. The child uses the temporary `site` directory as its current
working directory, so Windows can reject the recursive removal with `EBUSY`
while that process is still alive.

A 50-iteration diagnostic observed `child.exitCode === null` immediately after
all 50 calls to `child.kill()`, confirming that termination was still pending.
The filesystem race itself did not fail in that diagnostic because the child
usually exited before the subsequent removal reached the locked directory.

## TDD evidence

The cleanup first gained an assertion requiring the server to be terminated
before its current working directory was removed. The focused test failed with:

```text
AssertionError: static server must exit before removing its cwd
actual: null
```

The cleanup now subscribes to the child's `exit` event before sending the
termination signal and awaits that event with a 5-second abort bound. Only then
does it remove the temporary directory. The final assertion accepts either an
exit code or a signal code because Node leaves `exitCode` null when the process
terminates by signal.

## Verification

- Focused test after the fix: passed.
- Focused test in 50 independent runs: 50 passed, 0 failed.
- `npm test`: 47 passed, 0 failed.
