"""
watchdog.py - Kill a child process when a parent process dies.

Usage: python watchdog.py <parent_pid> <child_pid>
"""

import sys
import os
import time
import signal


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # exists but not ours to signal


def main() -> None:
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <parent_pid> <child_pid>", file=sys.stderr)
        sys.exit(1)

    parent_pid = int(sys.argv[1])
    child_pid = int(sys.argv[2])

    while True:
        time.sleep(1)

        if not pid_alive(parent_pid):
            if pid_alive(child_pid):
                os.kill(child_pid, signal.SIGTERM)
            sys.exit(0)

        if not pid_alive(child_pid):
            sys.exit(0)


if __name__ == "__main__":
    main()
