"""Keep a local process tree in a Windows kill-on-close job.

The supervisor joins its own job before spawning anything. Its non-inheritable
job handle is closed by Windows even when this supervisor is forcibly killed.
Parent death also exits the supervisor. No PID-based descendant enumeration.
https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
"""
import ctypes
from ctypes import wintypes as w
import os
import subprocess
import sys
import threading


class BasicLimits(ctypes.Structure):
    _fields_ = [("process_time", ctypes.c_longlong), ("job_time", ctypes.c_longlong),
                ("flags", w.DWORD), ("min_working", ctypes.c_size_t),
                ("max_working", ctypes.c_size_t), ("active", w.DWORD),
                ("affinity", ctypes.c_size_t), ("priority", w.DWORD),
                ("scheduling", w.DWORD)]


class IoCounters(ctypes.Structure):
    _fields_ = [(name, ctypes.c_ulonglong) for name in
                ("read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes")]


class ExtendedLimits(ctypes.Structure):
    _fields_ = [("basic", BasicLimits), ("io", IoCounters),
                ("process_memory", ctypes.c_size_t), ("job_memory", ctypes.c_size_t),
                ("peak_process", ctypes.c_size_t), ("peak_job", ctypes.c_size_t)]


def main():
    if os.name != "nt" or len(sys.argv) < 5 or sys.argv[3] != "--":
        raise RuntimeError("Windows supervisor requires parent PID and exact executable argv")
    parent_pid = int(sys.argv[1])
    timeout_ms = int(sys.argv[2])
    if timeout_ms <= 0:
        raise RuntimeError("Positive timeout required")
    if parent_pid <= 0 or parent_pid == os.getpid():
        raise RuntimeError("Invalid parent PID")
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    def api(name, args, result):
        function = getattr(kernel, name)
        function.argtypes, function.restype = args, result
        return function
    create_job = api("CreateJobObjectW", [ctypes.c_void_p, w.LPCWSTR], w.HANDLE)
    configure = api("SetInformationJobObject", [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD], w.BOOL)
    assign = api("AssignProcessToJobObject", [w.HANDLE, w.HANDLE], w.BOOL)
    current = api("GetCurrentProcess", [], w.HANDLE)
    open_process = api("OpenProcess", [w.DWORD, w.BOOL, w.DWORD], w.HANDLE)
    wait = api("WaitForSingleObject", [w.HANDLE, w.DWORD], w.DWORD)
    parent = open_process(0x00100000, False, parent_pid)  # SYNCHRONIZE
    if not parent:
        raise ctypes.WinError(ctypes.get_last_error())
    job = create_job(None, None)  # unnamed, non-inheritable
    if not job:
        raise ctypes.WinError(ctypes.get_last_error())
    limits = ExtendedLimits()
    limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not configure(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
        raise ctypes.WinError(ctypes.get_last_error())
    if not assign(job, current()):
        raise ctypes.WinError(ctypes.get_last_error())
    if wait(parent, 0) != 0x102:  # WAIT_TIMEOUT means parent still running
        os._exit(125)

    def watch_parent():
        wait(parent, 0xFFFFFFFF)
        os._exit(125)  # Closing this process's job handle kills descendants.
    threading.Thread(target=watch_parent, daemon=True).start()
    timer = threading.Timer(timeout_ms / 1000, lambda: os._exit(124))
    timer.daemon = True
    timer.start()
    try:
        child = subprocess.Popen(sys.argv[4:], close_fds=True,
                                 creationflags=subprocess.CREATE_NO_WINDOW)
        code = child.wait()
    except Exception as error:
        print(f"Local owned process could not start: {type(error).__name__}", file=sys.stderr, flush=True)
        code = 126
    # ExitProcess closes the non-inherited job handle, including orphaned children
    # left behind by an otherwise successful root process. Preserve root exit code.
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)


if __name__ == "__main__":
    main()
